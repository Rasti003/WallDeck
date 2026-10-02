import { z } from "zod";
import {
  assistantStateSchema,
  assistantToolCatalog,
  mcpToolIds,
  notificationSoundSchema,
  viewIdSchema,
  type DeviceStatus,
  type McpToolId,
  type SpotifyItem,
  type SpotifyQueue,
  type SpotifyStatus,
  type WallDeckSettings,
} from "@walldeck/contracts";
import { currentTimeSnapshot } from "./current-time.js";

type HomeEntity = { entityId: string; friendlyName: string; state: string; unit?: string | null; deviceClass?: string | null; lastChanged?: string | null };

export interface AssistantToolDependencies {
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

type ToolAnnotations = { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
type AssistantToolDefinition = {
  description: string;
  input: z.ZodObject<any>;
  annotations: ToolAnnotations;
  run(args: any, deps: AssistantToolDependencies, enabled: Record<McpToolId, boolean>): unknown | Promise<unknown>;
};

const readOnly = (openWorldHint = false): ToolAnnotations => ({ readOnlyHint: true, destructiveHint: false, openWorldHint });
const action = (openWorldHint = false): ToolAnnotations => ({ readOnlyHint: false, destructiveHint: false, openWorldHint });
const spotifyTypes = z.array(z.enum(["track", "album", "artist", "playlist", "episode"])).min(1).max(5);
const spotifyUri = z.string().regex(/^spotify:(track|album|artist|playlist|episode|show):[A-Za-z0-9]+$/);

export const assistantToolDefinitions = {
  get_status: {
    description: "Sprawdza aktywny widok, dostępność tabletu, integrację Home Assistant oraz włączone możliwości. Użyj przed sterowaniem, gdy bieżący stan ma znaczenie.",
    input: z.object({}), annotations: readOnly(),
    run: (_args, deps, enabled) => ({
      currentView: deps.currentView(),
      devices: deps.devices().map(device => ({ deviceId: device.deviceId, online: device.online, model: device.model, appVersion: device.appVersion, battery: device.battery })),
      homeAssistant: deps.homeAssistantStatus(), spotify: deps.spotifyStatus(),
      enabledTools: mcpToolIds.filter(id => enabled[id]),
    }),
  },
  get_current_time: {
    description: "Zwraca dokładną bieżącą datę, godzinę, dzień tygodnia i przesunięcie UTC dla domu w strefie Europe/Warsaw. Użyj zawsze, gdy odpowiedź lub działanie zależy od słów: teraz, dziś, jutro, godzina, data albo termin.",
    input: z.object({}), annotations: readOnly(), run: () => currentTimeSnapshot(),
  },
  show_view: {
    description: "Przełącza ekran tabletu na zdjęcia, Home Assistant, odtwarzacz muzyki albo twarz asystenta.",
    input: z.object({ view: viewIdSchema }), annotations: action(),
    run: ({ view }, deps) => { deps.activateView(view); return { ok: true, view }; },
  },
  show_assistant_mood: {
    description: "Wyświetla twarz asystenta w wybranym stanie emocjonalnym lub roboczym. Używaj krótkotrwale jako wizualnej odpowiedzi panelu.",
    input: z.object({ mood: assistantStateSchema }), annotations: action(),
    run: ({ mood }, deps) => deps.panelCommand("assistant.mood", { mood }),
  },
  control_music: {
    description: "Steruje aktualnym odtwarzaniem Spotify na tablecie. Nie wyszukuje utworów i nie zmienia urządzenia Spotify Connect.",
    input: z.object({
      action: z.enum(["play", "pause", "next", "previous", "seek", "shuffle", "repeat"]),
      positionMs: z.number().int().min(0).max(86_400_000).optional(),
      enabled: z.boolean().optional(), mode: z.number().int().min(0).max(2).optional(),
    }), annotations: action(),
    run: (args, deps) => {
      if (args.action === "seek" && args.positionMs === undefined) throw new Error("positionMs jest wymagane dla seek");
      if (args.action === "shuffle" && args.enabled === undefined) throw new Error("enabled jest wymagane dla shuffle");
      if (args.action === "repeat" && args.mode === undefined) throw new Error("mode jest wymagane dla repeat");
      return deps.panelCommand("music.control", args);
    },
  },
  search_spotify: {
    description: "Wyszukuje utwory, albumy, artystów, playlisty lub podcasty. Zwraca URI potrzebne do odtworzenia albo dodania do kolejki.",
    input: z.object({ query: z.string().trim().min(1).max(120), types: spotifyTypes.default(["track", "playlist"]) }), annotations: readOnly(true),
    run: async ({ query, types }, deps) => ({ items: await deps.searchSpotify(query, types) }),
  },
  get_spotify_queue: {
    description: "Zwraca aktualnie odtwarzany element i kolejne pozycje kolejki Spotify.",
    input: z.object({}), annotations: readOnly(true), run: (_args, deps) => deps.spotifyQueue(),
  },
  list_spotify_playlists: {
    description: "Zwraca pierwsze playlisty zalogowanego konta Spotify wraz z URI.",
    input: z.object({}), annotations: readOnly(true), run: async (_args, deps) => ({ items: await deps.spotifyPlaylists() }),
  },
  play_spotify_item: {
    description: "Uruchamia utwór, album, playlistę lub podcast na Spotify działającym na tablecie WallDeck.",
    input: z.object({ uri: spotifyUri }), annotations: action(true),
    run: ({ uri }, deps) => deps.panelCommand("music.playContext", { uri }),
  },
  add_spotify_to_queue: {
    description: "Dodaje wskazany utwór lub odcinek podcastu do kolejki Spotify na tablecie.",
    input: z.object({ uri: z.string().regex(/^spotify:(track|episode):[A-Za-z0-9]+$/) }), annotations: action(true),
    run: ({ uri }, deps) => deps.panelCommand("music.addToQueue", { uri }),
  },
  set_tablet_volume: {
    description: "Ustawia głośność multimediów tabletu w zakresie 0–100%. Dotyczy aktywnego wyjścia muzyki, które może być Bluetooth.",
    input: z.object({ percent: z.number().min(0).max(100) }), annotations: action(),
    run: ({ percent }, deps) => deps.panelCommand("tablet.volume", { value: percent / 100 }),
  },
  adjust_tablet_volume: {
    description: "Podgłaśnia lub ścisza multimedia względem obecnego poziomu. Jeśli użytkownik nie podał wartości, użyj +10 dla podgłośnienia albo -10 dla ściszenia.",
    input: z.object({ deltaPercent: z.number().min(-50).max(50) }), annotations: action(),
    run: ({ deltaPercent }, deps) => deps.panelCommand("tablet.volume.adjust", { delta: deltaPercent / 100 }),
  },
  send_notification: {
    description: "Pokazuje krótki komunikat lub alarm na panelu. Alarm może pozostać do ręcznego zamknięcia.",
    input: z.object({
      message: z.string().trim().min(1).max(240), priority: z.enum(["normal", "alarm"]).default("normal"),
      persistent: z.boolean().optional(), durationSeconds: z.number().int().min(2).max(600).optional(), sound: notificationSoundSchema.optional(),
    }), annotations: action(),
    run: ({ message, priority, persistent, durationSeconds, sound }, deps) => {
      const alarm = priority === "alarm";
      deps.notify({ id: `assistant:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, message, kind: alarm ? "error" : "info", priority, ...(persistent === undefined ? {} : { persistent }), ...(durationSeconds === undefined ? {} : { durationMs: durationSeconds * 1000 }), ...(sound === undefined ? {} : { sound }) });
      return { ok: true, priority };
    },
  },
  set_view_brightness: {
    description: "Zmienia zapisaną jasność konkretnego widoku WallDeck. Zmiana jest stosowana przez tablet przy aktywacji tego widoku.",
    input: z.object({ view: viewIdSchema, percent: z.number().min(5).max(100) }), annotations: action(),
    run: async ({ view, percent }, deps) => {
      const current = await deps.readSettings();
      const saved = await deps.writeSettings({ ...current, viewBrightness: { ...current.viewBrightness, [view]: percent / 100 } });
      return { ok: true, view, percent: Math.round(saved.viewBrightness[view as keyof typeof saved.viewBrightness] * 100) };
    },
  },
  search_home_entities: {
    description: "Wyszukuje encje dostępne w podłączonym Home Assistant. Użyj, gdy nie znasz dokładnego entity_id.",
    input: z.object({ query: z.string().trim().max(100).default("") }), annotations: readOnly(),
    run: ({ query }, deps) => ({ entities: deps.searchHomeEntities(query).slice(0, 50) }),
  },
  get_home_entity: {
    description: "Zwraca aktualny stan jednej encji Home Assistant po dokładnym entity_id. Nie zmienia urządzenia.",
    input: z.object({ entityId: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i) }), annotations: readOnly(),
    run: ({ entityId }, deps) => {
      const entity = deps.homeEntity(entityId);
      if (!entity) throw new Error("Encja nie jest dostępna");
      return entity;
    },
  },
} satisfies Record<McpToolId, AssistantToolDefinition>;

export async function executeAssistantTool(id: McpToolId, raw: unknown, deps: AssistantToolDependencies, enabled: Record<McpToolId, boolean>) {
  if (!enabled[id]) throw new Error(`Narzędzie ${id} jest wyłączone`);
  const definition = assistantToolDefinitions[id];
  return definition.run(definition.input.parse(raw), deps, enabled);
}

export function enabledAssistantToolIds(enabled: Record<McpToolId, boolean>) {
  return mcpToolIds.filter(id => enabled[id]);
}

export function assistantToolTitle(id: McpToolId) {
  return assistantToolCatalog[id].label;
}
