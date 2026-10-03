import { registerPhotos } from "./photos.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { registerClient } from "./client.js";
import websocket from "@fastify/websocket";
import {
  defaultSettings,
  aiAssistantConfigInputSchema,
  aiAssistantRunInputSchema,
  aiAssistantSpeechInputSchema,
  alarmInputSchema,
  assistantTaskInputSchema,
  deviceReportSchema,
  homeAssistantConfigInputSchema,
  notificationPreviewSchema,
  settingsSchema,
  snoozeInputSchema,
  timerInputSchema,
  viewIdSchema,
  type ViewId,
  type WallDeckSettings,
  type WeatherNow,
  type DeviceReport,
  type DeviceStatus,
  type SpeakerObservation,
} from "@walldeck/contracts";
import { HomeAssistantClient, HomeAssistantConfigStore } from "./home-assistant.js";
import { registerMcpEndpoint } from "./mcp.js";
import { SpotifyConnector } from "./spotify.js";
import { AssistantService } from "./assistant.js";
import { EncryptedSecretStore } from "./secret-store.js";
import { LiveVoiceUsageStore, renderLiveSpeech } from "./live-voice.js";
import { registerLiveConversation } from "./live-conversation.js";
import { registerLunaConversation } from "./luna-conversation.js";
import { SpeakerObserverClient } from "./speaker-observer.js";
import { listElevenLabsVoices, renderElevenLabsSpeech } from "./elevenlabs.js";
import { AssistantHistoryStore } from "./assistant-history.js";
import { ScheduleStore } from "./schedules.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../client/dist");
const runtimeRoot = path.resolve(process.env.WALLDECK_DATA_PATH ?? path.join(here, "../../../storage"));
const photoRoot = path.resolve(process.env.PHOTO_STORAGE_PATH ?? path.join(runtimeRoot, "photos"));
const settingsPath = path.join(runtimeRoot, "settings.json");
const port = Number(process.env.PORT ?? 8080);

await mkdir(runtimeRoot, { recursive: true });

async function readSettings(): Promise<WallDeckSettings> {
  try {
    const parsed = settingsSchema.parse(JSON.parse(await readFile(settingsPath, "utf8")));
    if (!parsed.tabletMenu.views.includes("timers")) parsed.tabletMenu.views.splice(Math.min(2, parsed.tabletMenu.views.length), 0, "timers");
    return parsed;
  } catch {
    return defaultSettings;
  }
}

async function writeSettingsValue(settings: WallDeckSettings): Promise<WallDeckSettings> {
  const parsed = settingsSchema.parse(settings);
  await writeFile(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  broadcast({ type: "settings.changed", settings: parsed });
  return parsed;
}

let currentView: ViewId = "photos";
type PanelSocket = { send(data: string): void; readyState: number };
const sockets = new Set<PanelSocket>();
const panelSockets = new Set<PanelSocket>();
const pendingPanelCommands = new Map<string, { resolve(value: unknown): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> }>();
const devices = new Map<string, DeviceReport & { lastSeen: string }>();
let weatherCache: { key: string; expiresAt: number; value: WeatherNow } | null = null;

function deviceStatuses(): DeviceStatus[] {
  const onlineAfter = Date.now() - 45_000;
  return [...devices.values()]
    .map((device) => ({ ...device, online: Date.parse(device.lastSeen) >= onlineAfter }))
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

function broadcast(message: unknown) {
  const data = JSON.stringify(message);
  for (const socket of sockets) if (socket.readyState === 1) socket.send(data);
}

function activateView(viewId: ViewId) {
  currentView = viewId;
  broadcast({ type: "view.activated", viewId });
}

function panelCommand(name: string, args: Record<string, unknown>) {
  const socket = [...panelSockets].find(candidate => candidate.readyState === 1);
  if (!socket) return Promise.reject(new Error("Tablet WallDeck jest offline"));
  const id = randomUUID();
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => { pendingPanelCommands.delete(id); reject(new Error("Tablet nie odpowiedział na komendę")); }, 15_000);
    pendingPanelCommands.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ type: "mcp.command", id, command: name, args }));
  });
}

const haConfigStore = new HomeAssistantConfigStore(runtimeRoot);
const homeAssistant = new HomeAssistantClient((event) => {
  if (event.type === "status") broadcast({ type: "ha.statusChanged", status: homeAssistant.status() });
  else broadcast({ type: "ha.stateChanged", entities: event.entities });
});

const storedHaConfig = await haConfigStore.load();
if (storedHaConfig) void homeAssistant.configure(storedHaConfig);
const spotify = new SpotifyConnector(runtimeRoot);
const initialSettings = await readSettings();
await spotify.load(initialSettings.music.clientId);
const openAiKeyStore = new EncryptedSecretStore(runtimeRoot, "openai-api-key");
const elevenLabsKeyStore = new EncryptedSecretStore(runtimeRoot, "elevenlabs-api-key");
const liveVoiceUsage = new LiveVoiceUsageStore(runtimeRoot);
const speakerObserver = new SpeakerObserverClient();
const mcpToken = process.env.WALLDECK_MCP_TOKEN ?? "";
const assistant = new AssistantService({
  mcpUrl: `http://127.0.0.1:${port}/mcp`,
  mcpToken,
  getApiKey: () => openAiKeyStore.load(),
});
const assistantHistory = new AssistantHistoryStore(path.join(runtimeRoot, "assistant-history.json"));
let schedules: ScheduleStore;
let voiceBusy = false;
let lastSpeakerObservation: SpeakerObservation | null = null;

const app = Fastify({ logger: true });
await app.register(websocket);

schedules = new ScheduleStore(path.join(runtimeRoot, "schedules.json"), {
  onChanged: items => broadcast({ type: "schedules.changed", items }),
  onFired: async item => {
    if (item.kind !== "task") activateView("timers");
    broadcast({ type: "schedule.fired", item });
    if (!item.automationPrompt) return;
    try {
      const settings = await readSettings();
      const context = item.kind === "task" ? `Nadszedł termin zaplanowanego zadania asystenta „${item.label}”.` : `Właśnie wybił ${item.kind === "timer" ? "minutnik" : "budzik"} „${item.label}”.`;
      const result = await assistant.execute(`${context} Wykonaj teraz zapisaną instrukcję: ${item.automationPrompt}`, settings.aiAssistant);
      await schedules.setAutomationResult(item.id, result.text);
    } catch (error) {
      await schedules.setAutomationResult(item.id, `Błąd zadania: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  },
});
await schedules.load();

app.get("/api/health", async () => ({ status: "ok", view: currentView }));
app.get("/api/devices", async () => deviceStatuses());
app.post("/api/notifications/preview", async (request, reply) => {
  const parsed = notificationPreviewSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowa próbka powiadomienia" });
  const alarm = parsed.data.priority === "alarm";
  broadcast({ type: "notification", notification: { id: `admin-preview:${parsed.data.priority}:${Date.now()}`, message: alarm ? "Przykładowy alarm WallDeck" : "Przykładowe powiadomienie WallDeck", kind: alarm ? "error" : "info", ...parsed.data } });
  return { ok: true as const };
});

app.get("/api/schedules", async () => ({ items: schedules.list() }));
app.post("/api/timers", async (request, reply) => {
  const parsed = timerInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowy minutnik", details: parsed.error.issues });
  return schedules.createTimer(parsed.data);
});
app.post("/api/alarms", async (request, reply) => {
  const parsed = alarmInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowy budzik", details: parsed.error.issues });
  try { return await schedules.createAlarm(parsed.data); }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post("/api/assistant-tasks", async (request, reply) => {
  const parsed = assistantTaskInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowe zadanie asystenta", details: parsed.error.issues });
  try { return await schedules.createTask(parsed.data); }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.delete<{ Params: { id: string } }>("/api/schedules/:id", async (request, reply) => {
  try { return await schedules.remove(request.params.id); } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post<{ Params: { id: string } }>("/api/schedules/:id/dismiss", async (request, reply) => {
  try { return await schedules.dismiss(request.params.id); } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post<{ Params: { id: string } }>("/api/schedules/:id/snooze", async (request, reply) => {
  const parsed = snoozeInputSchema.safeParse(request.body ?? {});
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowy czas drzemki" });
  try { return await schedules.snooze(request.params.id, parsed.data.minutes); } catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : String(error) }); }
});

app.get("/api/settings", async () => readSettings());
app.put("/api/settings", async (request, reply) => {
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowe ustawienia", details: parsed.error.issues });
  spotify.configure(parsed.data.music.clientId);
  return writeSettingsValue(parsed.data);
});

async function assistantStatus() {
  const settings = await readSettings();
  return {
    configured: Boolean(await openAiKeyStore.load()),
    elevenLabsConfigured: Boolean(await elevenLabsKeyStore.load()),
    enabled: settings.aiAssistant.enabled,
    mcpReady: settings.mcp.enabled && Boolean(mcpToken),
    busy: assistant.busy,
    voiceUsage: await liveVoiceUsage.status(settings.aiAssistant),
    speakerObservation: lastSpeakerObservation,
    speakerObserver: await speakerObserver.health(),
  };
}

async function renderOpenAiTts(apiKey: string, text: string, settings: WallDeckSettings["aiAssistant"]["voice"], responseFormat: "mp3" | "pcm" = "mp3") {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: settings.model, voice: settings.voice, input: text, instructions: settings.instructions, response_format: responseFormat }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `OpenAI TTS zwróciło ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

app.get("/api/assistant/config", async () => ({ settings: (await readSettings()).aiAssistant, status: await assistantStatus() }));
app.get("/api/assistant/history", async () => assistantHistory.list());
app.delete("/api/assistant/history", async () => { await assistantHistory.clear(); return { ok: true as const }; });
app.put("/api/assistant/config", async (request, reply) => {
  const parsed = aiAssistantConfigInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowa konfiguracja asystenta", details: parsed.error.issues });
  if (parsed.data.apiKey) await openAiKeyStore.save(parsed.data.apiKey);
  if (parsed.data.elevenLabsApiKey) await elevenLabsKeyStore.save(parsed.data.elevenLabsApiKey);
  const current = await readSettings();
  const saved = await writeSettingsValue({ ...current, aiAssistant: parsed.data.settings });
  return { settings: saved.aiAssistant, status: await assistantStatus() };
});
app.post("/api/assistant/run", async (request, reply) => {
  const parsed = aiAssistantRunInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Wpisz poprawne polecenie", details: parsed.error.issues });
  const settings = await readSettings();
  if (!settings.mcp.enabled) return reply.code(409).send({ error: "Najpierw włącz MCP w sekcji MCP · AI" });
  const startedAt = new Date().toISOString();
  try {
    const result = await assistant.execute(parsed.data.message, settings.aiAssistant, parsed.data.forceFallback);
    await assistantHistory.add({ source: "admin-text", startedAt, transcript: parsed.data.message, result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await assistantHistory.add({ source: "admin-text", startedAt, transcript: parsed.data.message, error: message }).catch(() => undefined);
    return reply.code(502).send({ error: message });
  }
});
app.post("/api/assistant/speech", async (request, reply) => {
  const parsed = aiAssistantSpeechInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowy tekst próbki" });
  const settings = (await readSettings()).aiAssistant;
  if (!settings.voice.enabled) return reply.code(409).send({ error: "Model głosowy jest wyłączony" });
  if (voiceBusy) return reply.code(409).send({ error: "Inna próbka głosu jest jeszcze generowana" });
  voiceBusy = true;
  try {
    if (settings.voice.provider === "elevenlabs") {
      const apiKey = await elevenLabsKeyStore.load();
      if (!apiKey) return reply.code(409).send({ error: "Najpierw zapisz klucz ElevenLabs API" });
      const audio = await renderElevenLabsSpeech(apiKey, parsed.data.text, settings.voice.elevenLabs, "mp3_44100_128");
      return reply.header("content-type", "audio/mpeg").header("cache-control", "no-store").header("x-walldeck-voice-provider", "elevenlabs").send(audio);
    }
    const apiKey = await openAiKeyStore.load();
    if (!apiKey) return reply.code(409).send({ error: "Najpierw zapisz klucz OpenAI API" });
    const usageBefore = await liveVoiceUsage.status(settings);
    if (settings.voice.provider === "openai-live" && !usageBefore.exhausted) {
      try {
        const live = await renderLiveSpeech(apiKey, parsed.data.text, settings.voice, seconds => liveVoiceUsage.add(seconds));
        const usageAfter = await liveVoiceUsage.status(settings);
        return reply
          .header("content-type", "audio/wav")
          .header("cache-control", "no-store")
          .header("x-walldeck-voice-provider", "openai-live")
          .header("x-walldeck-live-seconds", String(live.usageSeconds))
          .header("x-walldeck-live-spend-usd", String(usageAfter.estimatedUsd))
          .send(live.audio);
      } catch (error) {
        if (!settings.voice.live.fallbackToTts) throw error;
        app.log.warn({ err: error }, "GPT-Live speech failed; falling back to OpenAI TTS");
      }
    } else if (settings.voice.provider === "openai-live" && !settings.voice.live.fallbackToTts) {
      return reply.code(429).send({ error: "Miesięczny limit GPT-Live został osiągnięty" });
    }
    const audio = await renderOpenAiTts(apiKey, parsed.data.text, settings.voice);
    return reply
      .header("content-type", "audio/mpeg")
      .header("cache-control", "no-store")
      .header("x-walldeck-voice-provider", settings.voice.provider === "openai-live" ? "openai-tts-fallback" : "openai-tts")
      .send(audio);
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    voiceBusy = false;
  }
});
app.post("/api/assistant/speech-pcm", async (request, reply) => {
  const parsed = aiAssistantSpeechInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowy tekst odpowiedzi" });
  const settings = (await readSettings()).aiAssistant;
  if (!settings.voice.enabled) return reply.code(409).send({ error: "Model głosowy jest wyłączony" });
  if (voiceBusy) return reply.code(409).send({ error: "Inna odpowiedź głosowa jest jeszcze generowana" });
  voiceBusy = true;
  try {
    let pcm: Buffer;
    let provider: string;
    if (settings.voice.provider === "elevenlabs") {
      const apiKey = await elevenLabsKeyStore.load();
      if (!apiKey) return reply.code(409).send({ error: "Brak klucza ElevenLabs API" });
      pcm = await renderElevenLabsSpeech(apiKey, parsed.data.text, settings.voice.elevenLabs, "pcm_24000");
      provider = "elevenlabs";
    } else {
      const apiKey = await openAiKeyStore.load();
      if (!apiKey) return reply.code(409).send({ error: "Brak klucza OpenAI API" });
      pcm = await renderOpenAiTts(apiKey, parsed.data.text, { ...settings.voice, voice: settings.voice.live.voice }, "pcm");
      provider = "openai-tts";
    }
    return reply
      .header("content-type", "application/octet-stream")
      .header("cache-control", "no-store")
      .header("x-walldeck-pcm-rate", "24000")
      .header("x-walldeck-voice-provider", provider)
      .send(pcm);
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    voiceBusy = false;
  }
});
app.get("/api/assistant/elevenlabs/voices", async (_request, reply) => {
  const apiKey = await elevenLabsKeyStore.load();
  if (!apiKey) return reply.code(409).send({ error: "Najpierw zapisz klucz ElevenLabs API" });
  try {
    return { voices: await listElevenLabsVoices(apiKey) };
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.post("/api/assistant/speaker-observation", async (request, reply) => {
  const body = request.body as { label?: unknown; confidence?: unknown; experimental?: unknown } | null;
  if (!body || typeof body.label !== "string" || !body.label.trim() || body.label.length > 80 || typeof body.confidence !== "number" || !Number.isFinite(body.confidence)) {
    return reply.code(400).send({ error: "Nieprawidłowa obserwacja głosu" });
  }
  const settings = (await readSettings()).aiAssistant;
  if (!settings.voice.live.speakerObservationEnabled) return reply.code(409).send({ error: "Obserwacja mówcy jest wyłączona" });
  lastSpeakerObservation = {
    label: body.label.trim(),
    confidence: Math.max(0, Math.min(1, body.confidence)),
    observedAt: new Date().toISOString(),
    experimental: true,
  };
  broadcast({ type: "assistant.speakerObserved", observation: lastSpeakerObservation });
  return lastSpeakerObservation;
});

const assistantToolDependencies = {
  readSettings,
  writeSettings: writeSettingsValue,
  currentView: () => currentView,
  devices: deviceStatuses,
  homeAssistantStatus: () => homeAssistant.status(),
  searchHomeEntities: (query?: string) => homeAssistant.searchEntities(query),
  homeEntity: (entityId: string) => homeAssistant.entity(entityId),
  spotifyStatus: () => spotify.status(),
  searchSpotify: (query: string, types?: import("@walldeck/contracts").SpotifyItem["type"][]) => spotify.search(query, types),
  spotifyQueue: () => spotify.queue(),
  spotifyPlaylists: () => spotify.playlists(),
  activateView,
  notify: (notification: Record<string, unknown>) => broadcast({ type: "notification", notification }),
  panelCommand,
  listSchedules: () => schedules.list(),
  createTimer: (input: import("@walldeck/contracts").TimerInput) => schedules.createTimer(input),
  createAlarm: (input: import("@walldeck/contracts").AlarmInput) => schedules.createAlarm(input),
  createAssistantTask: (input: import("@walldeck/contracts").AssistantTaskInput) => schedules.createTask(input),
  cancelSchedule: (id: string) => schedules.remove(id),
  dismissSchedule: (id: string) => schedules.dismiss(id),
  snoozeSchedule: (id: string, minutes: number) => schedules.snooze(id, minutes),
};

registerLiveConversation(app, {
  ...assistantToolDependencies,
  getApiKey: () => openAiKeyStore.load(),
  getSettings: async () => (await readSettings()).aiAssistant,
  getEnabledTools: async () => (await readSettings()).mcp.tools,
  usage: liveVoiceUsage,
  speakerObserver,
  onSpeakerObservation: observation => {
    lastSpeakerObservation = observation;
    broadcast({ type: "assistant.speakerObserved", observation });
  },
});

registerLunaConversation(app, {
  getApiKey: () => openAiKeyStore.load(),
  getSettings: async () => (await readSettings()).aiAssistant,
  assistant,
  speakerObserver,
  onSpeakerObservation: observation => {
    lastSpeakerObservation = observation;
    broadcast({ type: "assistant.speakerObserved", observation });
  },
  recordConversation: value => assistantHistory.add(value).then(() => undefined),
  renderSpeechPcm: async (apiKey, text, settings) => {
    if (settings.voice.provider === "elevenlabs") {
      const elevenLabsApiKey = await elevenLabsKeyStore.load();
      if (!elevenLabsApiKey) throw new Error("Brak klucza ElevenLabs API");
      return renderElevenLabsSpeech(elevenLabsApiKey, text, settings.voice.elevenLabs, "pcm_24000");
    }
    return renderOpenAiTts(apiKey, text, settings.voice, "pcm");
  },
});

app.get("/api/spotify/status", async () => spotify.status());
app.post("/api/spotify/auth/start", async (_request, reply) => {
  try { return { url: spotify.beginAuth() }; }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/api/spotify/callback", async (request, reply) => {
  try {
    if (request.query.error) throw new Error("Logowanie Spotify zostało anulowane");
    if (!request.query.code || !request.query.state) throw new Error("Brakuje danych odpowiedzi Spotify");
    await spotify.completeAuth(request.query.code, request.query.state);
    return reply.type("text/html; charset=utf-8").send("<!doctype html><meta charset=utf-8><title>WallDeck Spotify</title><style>body{font:18px system-ui;background:#152019;color:#dce8d7;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center}</style><main><h1>Spotify połączone</h1><p>Możesz zamknąć tę kartę i wrócić do WallDeck.</p></main>");
  } catch (error) {
    return reply.code(400).type("text/html; charset=utf-8").send(`<h1>Nie udało się połączyć Spotify</h1><p>${String(error).replace(/[<>&]/g, "")}</p>`);
  }
});
app.post("/api/spotify/disconnect", async () => { await spotify.disconnect(); return spotify.status(); });
app.get<{ Querystring: { q?: string; type?: string } }>("/api/spotify/search", async (request, reply) => {
  const query = request.query.q?.trim() ?? "";
  const allowed = new Set(["track", "album", "artist", "playlist", "episode"]);
  const types = request.query.type?.split(",").filter(type => allowed.has(type)) as any;
  if (!query || (request.query.type && !types.length)) return reply.code(400).send({ error: "Podaj zapytanie i poprawny typ Spotify" });
  try { return { items: await spotify.search(query, types?.length ? types : undefined) }; }
  catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.get("/api/spotify/queue", async (_request, reply) => {
  reply.header("Cache-Control", "no-store, max-age=0");
  try { return await spotify.queue(); } catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.get("/api/spotify/playlists", async (_request, reply) => {
  try { return { items: await spotify.playlists() }; } catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) }); }
});
app.post<{ Body: { uri?: string; action?: string } }>("/api/spotify/action", async (request, reply) => {
  const uri = request.body?.uri ?? ""; const action = request.body?.action ?? "";
  const playable = /^spotify:(track|album|artist|playlist|episode|show):[A-Za-z0-9]+$/.test(uri);
  const queueable = /^spotify:(track|episode):[A-Za-z0-9]+$/.test(uri);
  if ((action === "play" && !playable) || (action === "queue" && !queueable) || !["play", "queue"].includes(action)) return reply.code(400).send({ error: "Nieprawidłowa akcja Spotify" });
  try { return await panelCommand(action === "play" ? "music.playContext" : "music.addToQueue", { uri }); }
  catch (error) { return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) }); }
});

await registerPhotos(app, photoRoot, runtimeRoot, broadcast, readSettings);

app.get("/api/views", async () => ({ current: currentView, available: [
  { id: "photos", name: "Album zdjęć" },
  { id: "ha", name: "Home Assistant" },
  { id: "assistant-expressive", name: "Asystent — ekspresyjny" },
  { id: "music", name: "Music · Spotify" },
  { id: "timers", name: "Czas · minutniki i budziki" },
] }));
app.post("/api/views/activate", async (request, reply) => {
  const parsed = viewIdSchema.safeParse((request.body as { viewId?: unknown } | null)?.viewId);
  if (!parsed.success) return reply.code(400).send({ error: "Nieznany widok" });
  activateView(parsed.data);
  return { current: currentView };
});

app.get("/api/weather", async (_request, reply) => {
  const settings = await readSettings();
  const { latitude, longitude, label } = settings.overlay.weatherLocation;
  if (latitude === null || longitude === null) return reply.code(204).send();
  const key = `${latitude},${longitude},${label}`;
  if (weatherCache?.key === key && weatherCache.expiresAt > Date.now()) return weatherCache.value;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,weather_code,is_day",
    timezone: "auto",
  }).toString();
  const response = await fetch(url);
  if (!response.ok) return reply.code(502).send({ error: "Dostawca pogody jest niedostępny" });
  const data = await response.json() as { current: { temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number; time: string } };
  const value: WeatherNow = {
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    weatherCode: data.current.weather_code,
    isDay: data.current.is_day === 1,
    label,
    observedAt: data.current.time,
  };
  weatherCache = { key, value, expiresAt: Date.now() + 10 * 60_000 };
  return value;
});

app.get("/api/ha/config", async () => homeAssistant.status());

app.post("/api/ha/test", async (request, reply) => {
  const parsed = homeAssistantConfigInputSchema.pick({ baseUrl: true, token: true }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowa konfiguracja Home Assistant", details: parsed.error.issues });
  const token = parsed.data.token?.trim() || homeAssistant.token;
  if (!token) return reply.code(400).send({ error: "Podaj token Home Assistant" });
  try {
    return await homeAssistant.test(parsed.data.baseUrl, token);
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.put("/api/ha/config", async (request, reply) => {
  const parsed = homeAssistantConfigInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowa konfiguracja Home Assistant", details: parsed.error.issues });
  const token = parsed.data.token?.trim() || homeAssistant.token;
  if (!token) return reply.code(400).send({ error: "Podaj token Home Assistant" });
  try {
    await homeAssistant.test(parsed.data.baseUrl, token);
    const stored = await haConfigStore.save(parsed.data, homeAssistant.token);
    await homeAssistant.configure(stored);
    return homeAssistant.status();
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get<{ Querystring: { q?: string } }>("/api/ha/entities", async (request) => homeAssistant.searchEntities(request.query.q));
app.get<{ Params: { entityId: string } }>("/api/ha/entities/:entityId", async (request, reply) => {
  if (!/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(request.params.entityId)) return reply.code(400).send({ error: "Nieprawidłowy identyfikator encji" });
  const entity = homeAssistant.entity(request.params.entityId);
  return entity ?? reply.code(404).send({ error: "Encja nie jest dostępna" });
});
app.get("/api/ha/overlay", async () => homeAssistant.selectedStates());

registerMcpEndpoint(app, assistantToolDependencies, mcpToken);

app.get("/api/events", { websocket: true }, (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({
    type: "snapshot",
    viewId: currentView,
    homeAssistant: homeAssistant.status(),
    homeAssistantStates: homeAssistant.selectedStates(),
    devices: deviceStatuses(),
  }));
  let lastActivity = 0;
  socket.on("message", (raw: Buffer) => {
    if (raw.toString().length > 65_536) return;
    try {
      const message = JSON.parse(raw.toString()) as { type?: unknown; report?: unknown; id?: unknown; result?: unknown; error?: unknown };
      if (message.type === "panel.activity" && Date.now() - lastActivity > 400) {
        lastActivity = Date.now();
        broadcast({ type: "panel.activity" });
      } else if (message.type === "device.report") {
        const parsed = deviceReportSchema.safeParse(message.report);
        if (!parsed.success) return;
        const device = { ...parsed.data, lastSeen: new Date().toISOString() };
        devices.set(device.deviceId, device);
        panelSockets.add(socket);
        broadcast({ type: "device.updated", device: { ...device, online: true } satisfies DeviceStatus });
      } else if (message.type === "mcp.commandResult" && typeof message.id === "string") {
        const pending = pendingPanelCommands.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingPanelCommands.delete(message.id);
        if (typeof message.error === "string") pending.reject(new Error(message.error));
        else pending.resolve(message.result);
      }
    } catch { /* Ignore malformed activity messages. */ }
  });
  socket.on("close", () => { sockets.delete(socket); panelSockets.delete(socket); });
});

app.addHook("onClose", async () => { schedules.stop(); homeAssistant.stop(); });

try {
  await registerClient(app, webRoot);
} catch {
  app.log.warn("Client build not found; API-only mode enabled");
}

await app.listen({ port, host: "0.0.0.0" });
