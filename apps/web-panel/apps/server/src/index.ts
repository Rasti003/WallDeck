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
  deviceReportSchema,
  homeAssistantConfigInputSchema,
  notificationPreviewSchema,
  settingsSchema,
  viewIdSchema,
  type ViewId,
  type WallDeckSettings,
  type WeatherNow,
  type DeviceReport,
  type DeviceStatus,
} from "@walldeck/contracts";
import { HomeAssistantClient, HomeAssistantConfigStore } from "./home-assistant.js";
import { registerMcpEndpoint } from "./mcp.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "../../client/dist");
const runtimeRoot = path.resolve(process.env.WALLDECK_DATA_PATH ?? path.join(here, "../../../storage"));
const photoRoot = path.resolve(process.env.PHOTO_STORAGE_PATH ?? path.join(runtimeRoot, "photos"));
const settingsPath = path.join(runtimeRoot, "settings.json");
const port = Number(process.env.PORT ?? 8080);

await mkdir(runtimeRoot, { recursive: true });

async function readSettings(): Promise<WallDeckSettings> {
  try {
    return settingsSchema.parse(JSON.parse(await readFile(settingsPath, "utf8")));
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
    const timer = setTimeout(() => { pendingPanelCommands.delete(id); reject(new Error("Tablet nie odpowiedział na komendę")); }, 8_000);
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

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/api/health", async () => ({ status: "ok", view: currentView }));
app.get("/api/devices", async () => deviceStatuses());
app.post("/api/notifications/preview", async (request, reply) => {
  const parsed = notificationPreviewSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowa próbka powiadomienia" });
  const alarm = parsed.data.priority === "alarm";
  broadcast({ type: "notification", notification: { id: `admin-preview:${parsed.data.priority}:${Date.now()}`, message: alarm ? "Przykładowy alarm WallDeck" : "Przykładowe powiadomienie WallDeck", kind: alarm ? "error" : "info", ...parsed.data } });
  return { ok: true as const };
});

app.get("/api/settings", async () => readSettings());
app.put("/api/settings", async (request, reply) => {
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowe ustawienia", details: parsed.error.issues });
  return writeSettingsValue(parsed.data);
});

await registerPhotos(app, photoRoot, runtimeRoot, broadcast, readSettings);

app.get("/api/views", async () => ({ current: currentView, available: [
  { id: "photos", name: "Album zdjęć" },
  { id: "ha", name: "Home Assistant" },
  { id: "assistant-expressive", name: "Asystent — ekspresyjny" },
  { id: "music", name: "Music · Spotify" },
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

registerMcpEndpoint(app, {
  readSettings,
  writeSettings: writeSettingsValue,
  currentView: () => currentView,
  devices: deviceStatuses,
  homeAssistantStatus: () => homeAssistant.status(),
  searchHomeEntities: query => homeAssistant.searchEntities(query),
  homeEntity: entityId => homeAssistant.entity(entityId),
  activateView,
  notify: notification => broadcast({ type: "notification", notification }),
  panelCommand,
}, process.env.WALLDECK_MCP_TOKEN);

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

app.addHook("onClose", async () => homeAssistant.stop());

try {
  await registerClient(app, webRoot);
} catch {
  app.log.warn("Client build not found; API-only mode enabled");
}

await app.listen({ port, host: "0.0.0.0" });
