import type { PhotoItem } from "@walldeck/contracts";

export interface PhotoLayout {
  key: string;
  kind: "single" | "pair";
  items: PhotoItem[];
}

function randomItem(items: PhotoItem[], excluded: Set<string>, random: () => number) {
  const available = items.filter((item) => !excluded.has(item.id));
  const pool = available.length ? available : items;
  return pool[Math.floor(random() * pool.length)];
}

export function createPhotoLayout(
  photos: PhotoItem[],
  landscapeScreen: boolean,
  previous: PhotoLayout | null,
  random: () => number = Math.random,
): PhotoLayout | null {
  if (!photos.length) return null;

  const landscape = photos.filter((photo) => photo.orientation === "landscape" || photo.orientation === "square");
  const portrait = photos.filter((photo) => photo.orientation === "portrait");
  const excluded = new Set(previous?.items.map((item) => item.id));
  const singlePool = landscapeScreen ? landscape : portrait;
  const pairPool = landscapeScreen ? portrait : landscape;
  const canSingle = singlePool.length > 0;
  const canPair = pairPool.length >= 2;
  const usePair = canPair && (!canSingle || random() >= 0.5);

  if (usePair) {
    const first = randomItem(pairPool, excluded, random);
    const second = randomItem(pairPool, new Set([...excluded, first.id]), random);
    return { key: `${first.id}:${second.id}`, kind: "pair", items: [first, second] };
  }

  const item = randomItem(canSingle ? singlePool : photos, excluded, random);
  return { key: item.id, kind: "single", items: [item] };
}
