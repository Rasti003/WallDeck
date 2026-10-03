import { z } from "zod";
import {
  assistantStateSchema,
  assistantCanvasInputSchema,
  assistantToolCatalog,
  mcpToolIds,
  notificationSoundSchema,
  viewIdSchema,
  type DeviceStatus,
  type McpToolId,
  type SpotifyItem,
  type SpotifyQueue,
  type SpotifyStatus,
  type AlarmInput,
  type AssistantCanvasInput,
  type AssistantTaskInput,
  type ScheduledItem,
  type TimerInput,
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
  activateView(viewId: "photos" | "ha" | "assistant-expressive" | "assistant-canvas" | "music" | "timers"): void;
  searchWeb(query: string, includeImages?: boolean): Promise<unknown>;
  prepareAssistantCanvas(request: { topic: string; context: string; includeImages: boolean }): unknown;
  showAssistantCanvas(canvas: AssistantCanvasInput): unknown;
  notify(notification: Record<string, unknown>): void;
  panelCommand(name: string, args: Record<string, unknown>): Promise<unknown>;
  listSchedules(): ScheduledItem[];
  createTimer(input: TimerInput): Promise<ScheduledItem>;
  createAlarm(input: AlarmInput): Promise<ScheduledItem>;
  createAssistantTask(input: AssistantTaskInput): Promise<ScheduledItem>;
  setAlarmEnabled(id: string, enabled: boolean): Promise<ScheduledItem>;
  cancelSchedule(id: string): Promise<unknown>;
  dismissSchedule(id: string): Promise<unknown>;
  snoozeSchedule(id: string, minutes: number): Promise<unknown>;
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
    description: "Pokazuje krótki komunikat lub alarm na panelu i czeka na potwierdzenie odbioru przez tablet. To działanie jest ciche, chyba że jawnie ustawisz dźwięk albo priorytet alarmowy.",
    input: z.object({
      message: z.string().trim().min(1).max(240), priority: z.enum(["normal", "alarm"]).default("normal"),
      persistent: z.boolean().optional(), durationSeconds: z.number().int().min(2).max(600).optional(), sound: notificationSoundSchema.optional(),
    }), annotations: action(),
    run: ({ message, priority, persistent, durationSeconds, sound }, deps) => {
      const alarm = priority === "alarm";
      return deps.panelCommand("notification.show", { id: `assistant:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, message, kind: alarm ? "error" : "info", priority, ...(persistent === undefined ? {} : { persistent }), ...(durationSeconds === undefined ? {} : { durationMs: durationSeconds * 1000 }), ...(sound === undefined ? {} : { sound }) });
    },
  },
  search_web: {
    description: "Wyszukuje aktualne informacje w internecie i zwraca zwięzłą odpowiedź, klikalne źródła oraz obrazy. Gdy użytkownik prosi o zdjęcie lub obraz, ustaw includeImages=true. Po wyszukaniu przedstaw wynik narzędziem show_assistant_canvas i przekaż jego images bez wymyślania adresów URL.",
    input: z.object({ query: z.string().trim().min(2).max(300), includeImages: z.boolean().default(false) }), annotations: readOnly(true),
    run: ({ query, includeImages }, deps) => deps.searchWeb(query, includeImages),
  },
  prepare_assistant_canvas: {
    description: "Zleca Lunie Canvas w tle i natychmiast zwraca jobId. Użyj dla prezentacji wiedzy ogólnej i zdjęć. Podaj pełny temat i kontekst, następnie odpowiadaj użytkownikowi bez czekania. Tekst i zdjęcia pojawią się niezależnie. To nie potwierdza ukończenia prezentacji. Nie używaj do aktualnych danych ani pomiarów HA: pobierz je i użyj show_assistant_canvas.",
    input: z.object({ topic: z.string().trim().min(2).max(300), context: z.string().trim().max(1800).default(""), includeImages: z.boolean().default(true) }), annotations: action(true),
    run: (args, deps, enabled) => {
      if (!enabled.show_assistant_canvas) throw new Error("Canvas jest wyłączony");
      if (args.includeImages && !enabled.search_web) throw new Error("Wyszukiwanie zdjęć jest wyłączone; ustaw includeImages=false");
      return deps.prepareAssistantCanvas(args);
    },
  },
  show_assistant_canvas: {
    description: "Pokazuje na tablecie uniwersalny Canvas. Użyj do odpowiedzi internetowych oraz zestawień wielu encji Home Assistant. Temperatury i CO₂ prezentuj jako duże metrics. Pole value w metric zawsze podawaj jako tekst, np. \"1174\". Chart twórz tylko dla co najmniej 2 dostępnych punktów liczbowych; dla jednego czujnika ustaw charts na pustą tablicę. tone może mieć wyłącznie wartość neutral, good, warning albo danger. Zachowaj krótki summary i dołącz źródła wyszukiwania. Wynik narzędzia podaje imagesCached i imagesRejected; potwierdzaj pokazanie zdjęć tylko wtedy, gdy imagesCached jest większe od zera.",
    input: assistantCanvasInputSchema, annotations: action(),
    run: (canvas, deps) => deps.showAssistantCanvas(canvas),
  },
  speak_on_tablet: {
    description: "Wypowiada jednorazowy krótki komunikat przez głośnik tabletu bez rozpoczynania rozmowy. Użyj tylko wtedy, gdy informacja powinna zwrócić uwagę głosem; większość automatyzacji wykonuj cicho.",
    input: z.object({ text: z.string().trim().min(1).max(500) }), annotations: action(),
    run: ({ text }, deps) => deps.panelCommand("assistant.speak", { text }),
  },
  start_live_conversation: {
    description: "Rozpoczyna interaktywną rozmowę GPT-Live na tablecie z wiadomością otwierającą i kontekstem. Użyj tylko wtedy, gdy potrzebna jest odpowiedź użytkownika; do jednostronnego komunikatu użyj speak_on_tablet.",
    input: z.object({ openingMessage: z.string().trim().min(1).max(500), context: z.string().trim().max(1_000).default("") }), annotations: action(),
    run: ({ openingMessage, context }, deps) => deps.panelCommand("assistant.startConversation", { openingMessage, context }),
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
  list_schedules: {
    description: "Zwraca minutniki, budziki i zadania asystenta z identyfikatorami, terminami, powtarzaniem, stanem oraz ostatnim wynikiem zadania.",
    input: z.object({}), annotations: readOnly(), run: (_args, deps) => ({ items: deps.listSchedules() }),
  },
  create_timer: {
    description: "Tworzy niezależny minutnik. automationPrompt jest opcjonalną instrukcją dla asystenta wykonywaną dopiero po wybiciu.",
    input: z.object({ durationSeconds: z.number().int().min(1).max(604_800), label: z.string().trim().max(100).default(""), automationPrompt: z.string().trim().max(1_000).default("") }), annotations: action(),
    run: (args, deps) => deps.createTimer(args),
  },
  create_alarm: {
    description: "Tworzy budzik. Dla jednorazowego podaj triggerAt jako ISO 8601 z offsetem. Dla cyklicznego podaj time HH:mm i repeatDays, gdzie 0=niedziela, 1=poniedziałek, ..., 6=sobota. automationPrompt wykona asystent po wybiciu.",
    input: z.object({ label: z.string().trim().max(100).default(""), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([]), triggerAt: z.string().datetime({ offset: true }).optional(), automationPrompt: z.string().trim().max(1_000).default("") }), annotations: action(),
    run: (args, deps) => deps.createAlarm(args as AlarmInput),
  },
  create_assistant_task: {
    description: "Planuje zadanie wykonywane później przez asystenta. Dla jednorazowego podaj triggerAt jako ISO 8601 z offsetem. Dla cyklicznego podaj time HH:mm i repeatDays, gdzie 0=niedziela, 1=poniedziałek, ..., 6=sobota. automationPrompt jest obowiązkową instrukcją, np. wysłaniem przypomnienia przez dostępne narzędzie. Zadanie nie uruchamia głośnego alarmu.",
    input: z.object({ label: z.string().trim().max(100).default(""), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([]), triggerAt: z.string().datetime({ offset: true }).optional(), automationPrompt: z.string().trim().min(1).max(1_000) }), annotations: action(),
    run: (args, deps) => deps.createAssistantTask(args as AssistantTaskInput),
  },
  set_alarm_enabled: {
    description: "Włącza albo wyłącza zapisany budzik bez jego usuwania. Przy ponownym włączeniu budzika cyklicznego wyznacza najbliższy termin. Użyj list_schedules, jeśli identyfikator nie jest znany.",
    input: z.object({ id: z.string().uuid(), enabled: z.boolean() }), annotations: action(),
    run: ({ id, enabled }, deps) => deps.setAlarmEnabled(id, enabled),
  },
  cancel_schedule: {
    description: "Trwale usuwa wskazany minutnik, budzik lub zadanie asystenta. Użyj list_schedules, jeśli identyfikator nie jest znany.",
    input: z.object({ id: z.string().uuid() }), annotations: action(), run: ({ id }, deps) => deps.cancelSchedule(id),
  },
  dismiss_schedule: {
    description: "Wyłącza dzwoniący alarm. Budzik cykliczny planuje następne wystąpienie, a jednorazowy jest usuwany.",
    input: z.object({ id: z.string().uuid() }), annotations: action(), run: ({ id }, deps) => deps.dismissSchedule(id),
  },
  snooze_schedule: {
    description: "Odkłada minutnik lub budzik o 1–180 minut.",
    input: z.object({ id: z.string().uuid(), minutes: z.number().int().min(1).max(180).default(10) }), annotations: action(), run: ({ id, minutes }, deps) => deps.snoozeSchedule(id, minutes),
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
