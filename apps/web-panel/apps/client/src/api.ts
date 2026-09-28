import type {
  DeviceStatus,
  HomeAssistantConfigInput,
  HomeAssistantEntity,
  HomeAssistantSelectedState,
  HomeAssistantStatus,
  PhotoItem,
  PhotoEdit,
  PhotoSyncStatus,
  NotificationPreview,
  SpotifyItem,
  SpotifyQueue,
  SpotifyStatus,
  ViewId,
  WallDeckSettings,
  WeatherNow,
} from "@walldeck/contracts";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  devices: () => json<DeviceStatus[]>("/api/devices"),
  photos: () => json<PhotoItem[]>("/api/photos"),
  photoSyncStatus: () => json<PhotoSyncStatus>("/api/photos/sync"),
  syncPhotos: () => json<PhotoSyncStatus>("/api/photos/sync", { method: "POST" }),
  previewNotification: (preview: NotificationPreview) => json<{ ok: true }>("/api/notifications/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preview) }),
  savePhoto: (id: string, edit: PhotoEdit) => json<PhotoEdit>(`/api/photos/${encodeURIComponent(id)}/edit`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(edit) }),
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
  homeAssistant: {
    config: () => json<HomeAssistantStatus>("/api/ha/config"),
    test: (baseUrl: string, token: string) => json<{ ok: true; version: string | null; entityCount: number }>("/api/ha/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl, token }),
    }),
    save: (config: HomeAssistantConfigInput) => json<HomeAssistantStatus>("/api/ha/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    }),
    entities: (query = "") => json<HomeAssistantEntity[]>(`/api/ha/entities?q=${encodeURIComponent(query)}`),
    entity: (entityId: string) => json<HomeAssistantEntity>(`/api/ha/entities/${encodeURIComponent(entityId)}`),
    overlay: () => json<HomeAssistantSelectedState[]>("/api/ha/overlay"),
  },
  spotify: {
    status: () => json<SpotifyStatus>("/api/spotify/status"),
    beginAuth: () => json<{ url: string }>("/api/spotify/auth/start", { method: "POST" }),
    disconnect: () => json<SpotifyStatus>("/api/spotify/disconnect", { method: "POST" }),
    search: (query: string, types = "track,playlist") => json<{ items: SpotifyItem[] }>(`/api/spotify/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(types)}`),
    queue: () => json<SpotifyQueue>("/api/spotify/queue", { cache: "no-store" }),
    playlists: () => json<{ items: SpotifyItem[] }>("/api/spotify/playlists"),
    action: (uri: string, action: "play" | "queue") => json<unknown>("/api/spotify/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri, action }) }),
  },
};

declare global {
  interface Window {
    WallDeckViews: { activate(viewId: ViewId): Promise<{ current: ViewId }> };
  }
}

window.WallDeckViews = { activate: api.activateView };
