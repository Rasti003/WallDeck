import { stat } from "node:fs/promises";
import exifr from "exifr";

export interface PhotoMetadata { takenOn: string | null; place: string | null; }

// Preserve the camera's calendar date: EXIF frequently has no time zone.
export function extractPhotoMetadata(tags: Record<string, unknown> = {}): PhotoMetadata {
  const raw = tags.DateTimeOriginal;
  const match = typeof raw === "string" ? /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T]|$)/.exec(raw) : null;
  let takenOn: string | null = null;
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 1000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) takenOn = `${match[1]}-${match[2]}-${match[3]}`;
  }
  const text = (value: unknown) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 80) : "";
  const places = [text(tags.Sublocation || tags.Location), text(tags.City), text(tags.Country || tags.CountryName)].filter(Boolean);
  let place = [...new Set(places)].join(" · ") || null;
  const { latitude, longitude } = tags;
  if (!place && typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    place = `${Math.abs(latitude).toFixed(2)}°${latitude < 0 ? "S" : "N"} ${Math.abs(longitude).toFixed(2)}°${longitude < 0 ? "W" : "E"}`;
  }
  return { takenOn, place };
}

const cache = new Map<string, { signature: string; value: Promise<PhotoMetadata> }>();
export async function readPhotoMetadata(filename: string): Promise<PhotoMetadata> {
  const info = await stat(filename);
  const signature = `${info.size}:${info.mtimeMs}`;
  const saved = cache.get(filename);
  if (saved?.signature === signature) return saved.value;
  const value = exifr.parse(filename, { iptc: true, xmp: true, reviveValues: false, makerNote: false, userComment: false })
    .then(tags => extractPhotoMetadata(tags)).catch(() => ({ takenOn: null, place: null }));
  if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
  cache.set(filename, { signature, value });
  return value;
}
