import type { PhotoItem, ViewId, WallDeckSettings, WeatherNow } from "@walldeck/contracts";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export const api = {
  photos: () => json<PhotoItem[]>("/api/photos"),
  settings: () => json<WallDeckSettings>("/api/settings"),
  saveSettings: (settings: WallDeckSettings) => json<WallDeckSettings>("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  }),
  views: () => json<{ current: ViewId; available: { id: ViewId; name: string }[] }>("/api/views"),
  activateView: (viewId: ViewId) => json<{ current: ViewId }>("/api/views/activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ viewId }),
  }),
  weather: async () => {
    const response = await fetch("/api/weather");
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json() as Promise<WeatherNow>;
  },
};

declare global {
  interface Window {
    WallDeckViews: { activate(viewId: ViewId): Promise<{ current: ViewId }> };
  }
}

window.WallDeckViews = { activate: api.activateView };
