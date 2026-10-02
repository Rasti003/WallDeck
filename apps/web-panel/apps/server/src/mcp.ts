import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { z } from "zod";
import {
  assistantStateSchema,
  notificationSoundSchema,
  viewIdSchema,
  type DeviceStatus,
  type McpToolId,
  type WallDeckSettings,
  type SpotifyItem,
  type SpotifyQueue,
  type SpotifyStatus,
} from "@walldeck/contracts";
import { currentTimeSnapshot } from "./current-time.js";

type HomeEntity = { entityId: string; friendlyName: string; state: string; unit?: string | null; deviceClass?: string | null; lastChanged?: string | null };

export interface WallDeckMcpDependencies {
  readSettings(): Promise<WallDeckSettings>;
  writeSettings(settings: WallDeckSettings): Promise<WallDeckSettings>;
  currentView(): string;
  devices(): DeviceStatus[];
  homeAssistantStatus(): unknown;
  searchHomeEntities(query?: string): HomeEntity[];
  homeEntity(entityId: string): HomeEntity | null;
  spotifyStatus(): SpotifyStatus;
  searchSpotify(query: string, types?: SpotifyItem["type"][]): Promise<SpotifyItem[]>;
  spotifyQueue(): Promise<SpotifyQueue>;
  spotifyPlaylists(): Promise<SpotifyItem[]>;
  activateView(viewId: "photos" | "ha" | "assistant-expressive" | "music"): void;
  notify(notification: Record<string, unknown>): void;
  panelCommand(name: string, args: Record<string, unknown>): Promise<unknown>;
}

const textResult = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

function registerIf(server: McpServer, enabled: Record<McpToolId, boolean>, id: McpToolId, config: any, handler: any) {
  if (enabled[id]) server.registerTool(id, config, handler);
}

export function createWallDeckMcpServer(settings: WallDeckSettings, deps: WallDeckMcpDependencies) {
  const server = new McpServer({ name: "WallDeck", version: "0.1.0" }, { capabilities: { tools: {} }, instructions: "Steruj jednym domowym panelem WallDeck. Używaj odczytów przed zmianami, nie zgaduj identyfikatorów encji i nie powtarzaj komend bez potrzeby." });
  const enabled = settings.mcp.tools;

  registerIf(server, enabled, "get_status", {
    title: "Odczytaj stan WallDeck",
    description: "Sprawdza aktywny widok, dostępność tabletu, integrację Home Assistant oraz włączone możliwości MCP. Użyj przed sterowaniem, gdy bieżący stan ma znaczenie.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => textResult({
    currentView: deps.currentView(),
    devices: deps.devices().map(device => ({
      deviceId: device.deviceId,
      online: device.online,
      model: device.model,
      appVersion: device.appVersion,
      battery: device.battery,
    })),
    homeAssistant: deps.homeAssistantStatus(),
    spotify: deps.spotifyStatus(),
    enabledTools: Object.entries(enabled).filter(([, value]) => value).map(([key]) => key),
  }));

  registerIf(server, enabled, "get_current_time", {
    title: "Odczytaj aktualną datę i godzinę",
    description: "Zwraca dokładną bieżącą datę, godzinę, dzień tygodnia i przesunięcie UTC dla domu w strefie Europe/Warsaw. Użyj zawsze, gdy odpowiedź lub działanie zależy od słów: teraz, dziś, jutro, godzina, data albo termin.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => textResult(currentTimeSnapshot()));

  registerIf(server, enabled, "show_view", {
    title: "Pokaż widok WallDeck",
    description: "Przełącza ekran tabletu na zdjęcia, Home Assistant, odtwarzacz muzyki albo twarz asystenta.",
    inputSchema: { view: viewIdSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ view }: { view: "photos" | "ha" | "assistant-expressive" | "music" }) => { deps.activateView(view); return textResult({ ok: true, view }); });

  registerIf(server, enabled, "show_assistant_mood", {
    title: "Pokaż nastrój asystenta",
    description: "Wyświetla twarz asystenta w wybranym stanie emocjonalnym lub roboczym. Używaj krótkotrwale jako wizualnej odpowiedzi panelu.",
    inputSchema: { mood: assistantStateSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ mood }: { mood: z.infer<typeof assistantStateSchema> }) => textResult(await deps.panelCommand("assistant.mood", { mood })));

  registerIf(server, enabled, "control_music", {
    title: "Steruj muzyką",
    description: "Steruje aktualnym odtwarzaniem Spotify na tablecie. Nie wyszukuje utworów i nie zmienia urządzenia Spotify Connect.",
    inputSchema: {
      action: z.enum(["play", "pause", "next", "previous", "seek", "shuffle", "repeat"]),
      positionMs: z.number().int().min(0).max(86_400_000).optional(),
      enabled: z.boolean().optional(),
      mode: z.number().int().min(0).max(2).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (args: { action: "play" | "pause" | "next" | "previous" | "seek" | "shuffle" | "repeat"; positionMs?: number; enabled?: boolean; mode?: number }) => {
    if (args.action === "seek" && args.positionMs === undefined) throw new Error("positionMs jest wymagane dla seek");
    if (args.action === "shuffle" && args.enabled === undefined) throw new Error("enabled jest wymagane dla shuffle");
    if (args.action === "repeat" && args.mode === undefined) throw new Error("mode jest wymagane dla repeat");
    return textResult(await deps.panelCommand("music.control", args));
  });

  registerIf(server, enabled, "search_spotify", {
    title: "Wyszukaj w Spotify",
    description: "Wyszukuje utwory, albumy, artystów, playlisty lub podcasty. Zwraca URI potrzebne do odtworzenia albo dodania do kolejki.",
    inputSchema: { query: z.string().trim().min(1).max(120), types: z.array(z.enum(["track", "album", "artist", "playlist", "episode"])).min(1).max(5).default(["track", "playlist"]) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ query, types }: { query: string; types: SpotifyItem["type"][] }) => textResult({ items: await deps.searchSpotify(query, types) }));

  registerIf(server, enabled, "get_spotify_queue", {
    title: "Odczytaj kolejkę Spotify",
    description: "Zwraca aktualnie odtwarzany element i kolejne pozycje kolejki Spotify.", inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async () => textResult(await deps.spotifyQueue()));

  registerIf(server, enabled, "list_spotify_playlists", {
    title: "Pokaż playlisty Spotify",
    description: "Zwraca pierwsze playlisty zalogowanego konta Spotify wraz z URI.", inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async () => textResult({ items: await deps.spotifyPlaylists() }));

  registerIf(server, enabled, "play_spotify_item", {
    title: "Odtwórz element Spotify",
    description: "Uruchamia utwór, album, playlistę lub podcast na Spotify działającym na tablecie WallDeck.",
    inputSchema: { uri: z.string().regex(/^spotify:(track|album|artist|playlist|episode|show):[A-Za-z0-9]+$/) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ uri }: { uri: string }) => textResult(await deps.panelCommand("music.playContext", { uri })));

  registerIf(server, enabled, "add_spotify_to_queue", {
    title: "Dodaj do kolejki Spotify",
    description: "Dodaje wskazany utwór lub odcinek podcastu do kolejki Spotify na tablecie.",
    inputSchema: { uri: z.string().regex(/^spotify:(track|episode):[A-Za-z0-9]+$/) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ uri }: { uri: string }) => textResult(await deps.panelCommand("music.addToQueue", { uri })));

  registerIf(server, enabled, "set_tablet_volume", {
    title: "Ustaw głośność tabletu",
    description: "Ustawia głośność multimediów tabletu w zakresie 0–100%. Dotyczy aktywnego wyjścia muzyki, które może być Bluetooth.",
    inputSchema: { percent: z.number().min(0).max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ percent }: { percent: number }) => textResult(await deps.panelCommand("tablet.volume", { value: percent / 100 })));

  registerIf(server, enabled, "adjust_tablet_volume", {
    title: "Zmień głośność tabletu względnie",
    description: "Podgłaśnia lub ścisza multimedia względem obecnego poziomu. Jeśli użytkownik nie podał wartości, użyj +10 dla podgłośnienia albo -10 dla ściszenia.",
    inputSchema: { deltaPercent: z.number().min(-50).max(50) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ deltaPercent }: { deltaPercent: number }) => textResult(await deps.panelCommand("tablet.volume.adjust", { delta: deltaPercent / 100 })));

  registerIf(server, enabled, "send_notification", {
    title: "Wyślij powiadomienie WallDeck",
    description: "Pokazuje krótki komunikat lub alarm na panelu. Alarm może pozostać do ręcznego zamknięcia.",
    inputSchema: {
      message: z.string().trim().min(1).max(240),
      priority: z.enum(["normal", "alarm"]).default("normal"),
      persistent: z.boolean().optional(),
      durationSeconds: z.number().int().min(2).max(600).optional(),
      sound: notificationSoundSchema.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ message, priority, persistent, durationSeconds, sound }: { message: string; priority: "normal" | "alarm"; persistent?: boolean; durationSeconds?: number; sound?: z.infer<typeof notificationSoundSchema> }) => {
    const alarm = priority === "alarm";
    deps.notify({ id: `mcp:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, message, kind: alarm ? "error" : "info", priority, ...(persistent === undefined ? {} : { persistent }), ...(durationSeconds === undefined ? {} : { durationMs: durationSeconds * 1000 }), ...(sound === undefined ? {} : { sound }) });
    return textResult({ ok: true, priority });
  });

  registerIf(server, enabled, "set_view_brightness", {
    title: "Ustaw jasność widoku",
    description: "Zmienia zapisaną jasność konkretnego widoku WallDeck. Zmiana jest stosowana przez tablet przy aktywacji tego widoku.",
    inputSchema: { view: viewIdSchema, percent: z.number().min(5).max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ view, percent }: { view: "photos" | "ha" | "assistant-expressive" | "music"; percent: number }) => {
    const current = await deps.readSettings();
    const saved = await deps.writeSettings({ ...current, viewBrightness: { ...current.viewBrightness, [view]: percent / 100 } });
    return textResult({ ok: true, view, percent: Math.round(saved.viewBrightness[view] * 100) });
  });

  registerIf(server, enabled, "search_home_entities", {
    title: "Wyszukaj encje domu",
    description: "Wyszukuje encje dostępne w podłączonym Home Assistant. Użyj, gdy nie znasz dokładnego entity_id.",
    inputSchema: { query: z.string().trim().max(100).default("") },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ query }: { query: string }) => textResult({ entities: deps.searchHomeEntities(query).slice(0, 50) }));

  registerIf(server, enabled, "get_home_entity", {
    title: "Odczytaj stan encji domu",
    description: "Zwraca aktualny stan jednej encji Home Assistant po dokładnym entity_id. Nie zmienia urządzenia.",
    inputSchema: { entityId: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ entityId }: { entityId: string }) => {
    const entity = deps.homeEntity(entityId);
    if (!entity) throw new Error("Encja nie jest dostępna");
    return textResult(entity);
  });

  return server;
}

function sameToken(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerMcpEndpoint(app: FastifyInstance, deps: WallDeckMcpDependencies, token: string | undefined) {
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      const settings = await deps.readSettings();
      if (!settings.mcp.enabled) return reply.code(404).send({ error: "MCP jest wyłączone" });
      if (!token) return reply.code(503).send({ error: "MCP nie ma skonfigurowanego tokenu" });
      const authorization = request.headers.authorization ?? "";
      const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!sameToken(token, supplied)) return reply.header("WWW-Authenticate", "Bearer").code(401).send({ error: "Brak dostępu" });

      const server = createWallDeckMcpServer(settings, deps);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack();
      reply.raw.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  });
}
