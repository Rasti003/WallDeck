import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import {
  defaultSettings,
  settingsSchema,
  viewIdSchema,
  type PhotoItem,
  type ViewId,
  type WallDeckSettings,
  type WeatherNow,
} from "@walldeck/contracts";

interface ManifestItem {
  id: string;
  filename: string;
  width: number;
  height: number;
  active: boolean;
  contentType?: string;
}

interface PhotoManifest {
  items: Record<string, ManifestItem>;
}

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

async function readManifest(): Promise<PhotoManifest> {
  try {
    return JSON.parse(await readFile(path.join(photoRoot, ".walldeck-album.json"), "utf8"));
  } catch {
    return { items: {} };
  }
}

function orientationOf(width: number, height: number): PhotoItem["orientation"] {
  if (width > height * 1.05) return "landscape";
  if (height > width * 1.05) return "portrait";
  return "square";
}

let currentView: ViewId = "photos";
const sockets = new Set<{ send(data: string): void; readyState: number }>();
let weatherCache: { key: string; expiresAt: number; value: WeatherNow } | null = null;

function broadcast(message: unknown) {
  const data = JSON.stringify(message);
  for (const socket of sockets) if (socket.readyState === 1) socket.send(data);
}

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/api/health", async () => ({ status: "ok", view: currentView }));

app.get("/api/settings", async () => readSettings());
app.put("/api/settings", async (request, reply) => {
  const parsed = settingsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Nieprawidłowe ustawienia", details: parsed.error.issues });
  await writeFile(settingsPath, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  broadcast({ type: "settings.changed", settings: parsed.data });
  return parsed.data;
});

app.get("/api/photos", async () => {
  const manifest = await readManifest();
  return Object.values(manifest.items)
    .filter((item) => item.active && item.filename)
    .map((item): PhotoItem => ({
      id: item.id,
      url: `/api/photos/${encodeURIComponent(item.id)}/file`,
      width: item.width,
      height: item.height,
      orientation: orientationOf(item.width, item.height),
    }));
});

app.get<{ Params: { id: string } }>("/api/photos/:id/file", async (request, reply) => {
  const manifest = await readManifest();
  const item = manifest.items[request.params.id];
  if (!item?.active || !item.filename) return reply.code(404).send({ error: "Nie znaleziono zdjęcia" });
  const fullPath = path.resolve(photoRoot, item.filename);
  if (path.dirname(fullPath) !== photoRoot) return reply.code(400).send({ error: "Nieprawidłowa ścieżka" });
  reply.type(item.contentType ?? "image/jpeg").header("cache-control", "public, max-age=86400, immutable");
  return reply.send(createReadStream(fullPath));
});

app.get("/api/views", async () => ({ current: currentView, available: [{ id: "photos", name: "Album zdjęć" }] }));
app.post("/api/views/activate", async (request, reply) => {
  const parsed = viewIdSchema.safeParse((request.body as { viewId?: unknown } | null)?.viewId);
  if (!parsed.success) return reply.code(400).send({ error: "Nieznany widok" });
  currentView = parsed.data;
  broadcast({ type: "view.activated", viewId: currentView });
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

app.get("/api/events", { websocket: true }, (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify({ type: "snapshot", viewId: currentView }));
  socket.on("close", () => sockets.delete(socket));
});

try {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
} catch {
  app.log.warn("Client build not found; API-only mode enabled");
}

await app.listen({ port, host: "0.0.0.0" });
