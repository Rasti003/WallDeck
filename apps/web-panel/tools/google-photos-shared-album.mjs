import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MANIFEST_NAME = ".walldeck-album.json";
const MEDIA_PATTERN = /\["(AF1Qip[A-Za-z0-9_-]+)",\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"?]+)",(\d+),(\d+),/g;

const EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/heic", ".heic"],
  ["image/heif", ".heif"],
]);

export function parseAlbumPage(html) {
  const items = new Map();
  for (const match of html.matchAll(MEDIA_PATTERN)) {
    const [, id, baseUrl, width, height] = match;
    items.set(id, {
      id,
      baseUrl,
      width: Number(width),
      height: Number(height),
    });
  }
  return [...items.values()];
}

function safeFilename(value) {
  const cleaned = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 140);
  return cleaned || "photo";
}

function filenameFromDisposition(value) {
  if (!value) return null;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  return value.match(/filename="([^"]+)"/i)?.[1] ?? null;
}

function outputName(originalName, id, contentType) {
  const parsed = path.parse(safeFilename(originalName ?? "photo"));
  const extension = EXTENSIONS.get(contentType) ?? parsed.ext.toLowerCase() ?? ".bin";
  return `${safeFilename(parsed.name)}--${id.slice(-12)}${extension || ".bin"}`;
}

async function loadManifest(storagePath) {
  try {
    return JSON.parse(await readFile(path.join(storagePath, MANIFEST_NAME), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, items: {} };
    throw error;
  }
}

async function saveManifest(storagePath, manifest) {
  const target = path.join(storagePath, MANIFEST_NAME);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "WallDeckPhotoSync/0.1" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function downloadItem(item, storagePath) {
  const response = await fetchWithRetry(`${item.baseUrl}=d`);
  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Nieobsługiwany typ ${contentType}`);
  }

  const originalName = filenameFromDisposition(response.headers.get("content-disposition"));
  const filename = outputName(originalName, item.id, contentType);
  const target = path.join(storagePath, filename);
  const temporary = `${target}.part`;

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }

  return { filename, contentType };
}

export async function syncSharedAlbum({ albumUrl, storagePath, concurrency = 3, onProgress = () => {} }) {
  await mkdir(storagePath, { recursive: true });
  const page = await fetchWithRetry(albumUrl);
  const html = await page.text();
  const remoteItems = parseAlbumPage(html);
  if (remoteItems.length === 0) {
    throw new Error("Nie znaleziono zdjęć. Sprawdź, czy album jest publicznie udostępniony przez link.");
  }

  const manifest = await loadManifest(storagePath);
  const now = new Date().toISOString();
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  for (const saved of Object.values(manifest.items)) saved.active = remoteIds.has(saved.id);

  const pendingChecks = await Promise.all(remoteItems.map(async (item) => {
    const filename = manifest.items[item.id]?.filename;
    if (!filename) return item;
    try {
      await access(path.join(storagePath, filename));
      return null;
    } catch {
      return item;
    }
  }));
  const pending = pendingChecks.filter(Boolean);
  let downloaded = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      try {
        const file = await downloadItem(item, storagePath);
        manifest.items[item.id] = { ...item, ...file, active: true, downloadedAt: now, lastSeenAt: now };
        downloaded += 1;
        onProgress({ type: "downloaded", downloaded, failed, total: pending.length, filename: file.filename });
      } catch (error) {
        failed += 1;
        onProgress({ type: "failed", downloaded, failed, total: pending.length, id: item.id, error: error.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, pending.length || 1)) }, worker));

  for (const item of remoteItems) {
    const saved = manifest.items[item.id];
    if (saved) manifest.items[item.id] = { ...saved, ...item, active: true, lastSeenAt: now };
  }

  manifest.sourceUrl = albumUrl;
  manifest.resolvedUrl = page.url;
  manifest.lastSyncAt = now;
  manifest.remoteCount = remoteItems.length;
  await saveManifest(storagePath, manifest);

  return {
    remoteCount: remoteItems.length,
    downloaded,
    skipped: remoteItems.length - pending.length,
    failed,
    inactive: Object.values(manifest.items).filter((item) => !item.active).length,
    manifestPath: path.join(storagePath, MANIFEST_NAME),
  };
}
