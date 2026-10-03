import type {
  AiAssistantConfigInput,
  AiAssistantRunInput,
  AiAssistantRunResult,
  AiAssistantConversationEntry,
  AiAssistantSettings,
  AiAssistantStatus,
  ElevenLabsVoice,
  SpeakerObservation,
  DeviceStatus,
  DiagnosticEntry,
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
  AlarmInput,
  AssistantTaskInput,
  ScheduledItem,
  TimerInput,
  ViewId,
  WallDeckSettings,
  WeatherNow,
} from "@walldeck/contracts";
import { reportClientError } from "./client-diagnostics";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch (error) {
    if (!url.startsWith("/api/diagnostics")) reportClientError("Błąd połączenia z API", `${init?.method ?? "GET"} ${url.split("?")[0]}`, error instanceof Error ? error.message : String(error));
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!url.startsWith("/api/diagnostics")) reportClientError("Błąd odpowiedzi API", `${init?.method ?? "GET"} ${url.split("?")[0]} · ${response.status}`, body?.error);
    throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  devices: () => json<DeviceStatus[]>("/api/devices"),
  diagnostics: {
    list: () => json<DiagnosticEntry[]>("/api/diagnostics?scope=all&limit=1000", { cache: "no-store" }),
    clear: (scope: "errors" | "activity") => json<{ ok: true }>(`/api/diagnostics?scope=${scope}`, { method: "DELETE" }),
    wakeWord: (event: { transcript: string; phrase: string; confidence: number; threshold: number; accepted: boolean; engine?: string }) => json<{ ok: true; id: string }>("/api/diagnostics/wake-word", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), keepalive: true,
    }),
  },
  photos: () => json<PhotoItem[]>("/api/photos"),
  photoSyncStatus: () => json<PhotoSyncStatus>("/api/photos/sync"),
  syncPhotos: () => json<PhotoSyncStatus>("/api/photos/sync", { method: "POST" }),
  previewNotification: (preview: NotificationPreview) => json<{ ok: true }>("/api/notifications/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preview) }),
  schedules: {
    list: () => json<{ items: ScheduledItem[] }>("/api/schedules", { cache: "no-store" }),
    createTimer: (input: TimerInput) => json<ScheduledItem>("/api/timers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    createAlarm: (input: AlarmInput) => json<ScheduledItem>("/api/alarms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    createAssistantTask: (input: AssistantTaskInput) => json<ScheduledItem>("/api/assistant-tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    updateAssistantTask: (id: string, input: AssistantTaskInput) => json<ScheduledItem>(`/api/assistant-tasks/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
    setAlarmEnabled: (id: string, enabled: boolean) => json<ScheduledItem>(`/api/schedules/${encodeURIComponent(id)}/enabled`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) }),
    remove: (id: string) => json<{ ok: true; id: string }>(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" }),
    dismiss: (id: string) => json<{ ok: true; id: string }>(`/api/schedules/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
    snooze: (id: string, minutes = 10) => json<ScheduledItem>(`/api/schedules/${encodeURIComponent(id)}/snooze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes }) }),
  },
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
  assistant: {
    config: () => json<{ settings: AiAssistantSettings; status: AiAssistantStatus }>("/api/assistant/config"),
    save: (config: AiAssistantConfigInput) => json<{ settings: AiAssistantSettings; status: AiAssistantStatus }>("/api/assistant/config", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config),
    }),
    run: (input: AiAssistantRunInput) => json<AiAssistantRunResult>("/api/assistant/run", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }),
    history: () => json<AiAssistantConversationEntry[]>("/api/assistant/history", { cache: "no-store" }),
    clearHistory: () => json<{ ok: true }>("/api/assistant/history", { method: "DELETE" }),
    speech: async (text: string) => {
      const response = await fetch("/api/assistant/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
      }
      return {
        blob: await response.blob(),
        provider: response.headers.get("x-walldeck-voice-provider") ?? "unknown",
        liveSeconds: Number(response.headers.get("x-walldeck-live-seconds") ?? 0),
        liveSpendUsd: Number(response.headers.get("x-walldeck-live-spend-usd") ?? 0),
      };
    },
    speechPcm: async (text: string) => {
      const response = await fetch("/api/assistant/speech-pcm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    speakerObservation: (observation: Pick<SpeakerObservation, "label" | "confidence" | "experimental">) => json<SpeakerObservation>("/api/assistant/speaker-observation", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(observation),
    }),
    elevenLabsVoices: () => json<{ voices: ElevenLabsVoice[] }>("/api/assistant/elevenlabs/voices"),
  },
};

declare global {
  interface Window {
    WallDeckViews: { activate(viewId: ViewId): Promise<{ current: ViewId }> };
  }
}

window.WallDeckViews = { activate: api.activateView };
