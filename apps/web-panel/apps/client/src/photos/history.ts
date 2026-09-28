import type { PhotoLayout } from "../views/photo-layout";
export interface PhotoHistory { items: PhotoLayout[]; index: number }
export function advanceHistory(history: PhotoHistory, direction: -1 | 1, create: () => PhotoLayout | null): PhotoHistory {
  if (direction === -1) return { ...history, index: Math.max(0, history.index - 1) };
  if (history.index + 1 < history.items.length) return { ...history, index: history.index + 1 };
  const next = create();
  if (!next) return history;
  const items = [...history.items, next].slice(-100);
  return { items, index: items.length - 1 };
}
