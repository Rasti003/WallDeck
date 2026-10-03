import { z } from "zod";
export type { MusicState, AudioOutputState, MusicController, SpotifyItem, SpotifyStatus, SpotifyQueue } from "./music.js";

export const assistantStates = ["idle", "attention", "listening", "thinking", "speaking", "success", "error", "sleep", "curious", "uncertain", "confirm", "surprised", "wink", "laughing", "dancing"] as const;
export const assistantStateSchema = z.enum(assistantStates);
export type AssistantState = z.infer<typeof assistantStateSchema>;
export const mcpToolIds = ["get_status", "get_current_time", "show_view", "show_assistant_mood", "search_web", "prepare_assistant_canvas", "show_assistant_canvas", "control_music", "search_spotify", "get_spotify_queue", "list_spotify_playlists", "play_spotify_item", "add_spotify_to_queue", "set_tablet_volume", "adjust_tablet_volume", "send_notification", "speak_on_tablet", "start_live_conversation", "set_view_brightness", "search_home_entities", "get_home_entity", "list_schedules", "create_timer", "create_alarm", "create_assistant_task", "set_alarm_enabled", "cancel_schedule", "dismiss_schedule", "snooze_schedule"] as const;
export const mcpToolIdSchema = z.enum(mcpToolIds);
export type McpToolId = z.infer<typeof mcpToolIdSchema>;
export const assistantToolCatalog = {
  get_status: { label: "Stan WallDeck", summary: "Aktywny widok, tablet, Home Assistant i dostępne narzędzia.", kind: "odczyt" },
  get_current_time: { label: "Aktualna data i godzina", summary: "Dokładny czas lokalny w strefie Europe/Warsaw oraz czas UTC.", kind: "odczyt" },
  show_view: { label: "Przełączanie widoku", summary: "Zdjęcia, Dom, Music lub ekran asystenta.", kind: "akcja" },
  show_assistant_mood: { label: "Mimika asystenta", summary: "Pokazanie konkretnego nastroju lub stanu twarzy.", kind: "akcja" },
  search_web: { label: "Wyszukiwanie internetu", summary: "Aktualne informacje, źródła i obrazy przez OpenAI web search.", kind: "odczyt" },
  prepare_assistant_canvas: { label: "Canvas w tle", summary: "Luna przygotowuje prezentację niezależnie od rozmowy; zdjęcia uzupełnia później.", kind: "akcja" },
  show_assistant_canvas: { label: "Canvas asystenta", summary: "Czytelna prezentacja odpowiedzi, pomiarów, wykresów, zdjęć i źródeł.", kind: "akcja" },
  control_music: { label: "Sterowanie muzyką", summary: "Play, pauza, następny, poprzedni, seek, shuffle i repeat.", kind: "akcja" },
  search_spotify: { label: "Wyszukiwanie Spotify", summary: "Utwory, albumy, artyści, playlisty i podcasty.", kind: "odczyt" },
  get_spotify_queue: { label: "Kolejka Spotify", summary: "Aktualnie odtwarzany element i kolejne pozycje.", kind: "odczyt" },
  list_spotify_playlists: { label: "Playlisty Spotify", summary: "Lista playlist zalogowanego konta.", kind: "odczyt" },
  play_spotify_item: { label: "Odtwarzanie wyniku", summary: "Uruchomienie znalezionego elementu na tablecie.", kind: "akcja" },
  add_spotify_to_queue: { label: "Dodawanie do kolejki", summary: "Dodanie utworu lub podcastu do kolejki tabletu.", kind: "akcja" },
  set_tablet_volume: { label: "Głośność tabletu", summary: "Zmiana poziomu multimediów aktywnego wyjścia audio.", kind: "akcja" },
  adjust_tablet_volume: { label: "Względna głośność", summary: "Podgłaśnianie i ściszanie względem obecnego poziomu.", kind: "akcja" },
  send_notification: { label: "Powiadomienia i alarmy", summary: "Komunikaty globalne z czasem, priorytetem i dźwiękiem.", kind: "akcja" },
  speak_on_tablet: { label: "Wypowiedź na tablecie", summary: "Jednorazowa wiadomość głosowa bez rozpoczynania rozmowy.", kind: "akcja" },
  start_live_conversation: { label: "Rozmowa GPT-Live", summary: "Rozpoczęcie rozmowy głosowej na tablecie z przekazanym kontekstem.", kind: "akcja" },
  set_view_brightness: { label: "Jasność widoku", summary: "Trwała zmiana jasności wybranego widoku.", kind: "akcja" },
  search_home_entities: { label: "Wyszukiwanie encji HA", summary: "Odnajdywanie entity_id po nazwie lub domenie.", kind: "odczyt" },
  get_home_entity: { label: "Stan encji HA", summary: "Odczyt aktualnego stanu jednej wskazanej encji.", kind: "odczyt" },
  list_schedules: { label: "Harmonogram", summary: "Lista minutników, budzików i zadań asystenta wraz z wynikami.", kind: "odczyt" },
  create_timer: { label: "Nowy minutnik", summary: "Minutnik z etykietą i opcjonalną automatyzacją AI.", kind: "akcja" },
  create_alarm: { label: "Nowy budzik", summary: "Jednorazowy lub powtarzalny budzik z etykietą.", kind: "akcja" },
  create_assistant_task: { label: "Zaplanuj zadanie asystenta", summary: "Jednorazowa lub powtarzalna instrukcja wykonywana w wybranym terminie.", kind: "akcja" },
  set_alarm_enabled: { label: "Włącz lub wyłącz budzik", summary: "Zmiana aktywności zapisanego budzika bez jego usuwania.", kind: "akcja" },
  cancel_schedule: { label: "Usuń wpis harmonogramu", summary: "Usunięcie minutnika, budzika lub zadania po identyfikatorze.", kind: "akcja" },
  dismiss_schedule: { label: "Wyłącz alarm", summary: "Zatrzymanie aktualnie dzwoniącego alarmu.", kind: "akcja" },
  snooze_schedule: { label: "Drzemka", summary: "Odłożenie aktualnego alarmu o podaną liczbę minut.", kind: "akcja" },
} as const satisfies Record<McpToolId, { label: string; summary: string; kind: "odczyt" | "akcja" }>;
export const mcpSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  tools: z.object({
    get_status: z.boolean().default(true),
    get_current_time: z.boolean().default(true),
    show_view: z.boolean().default(true),
    show_assistant_mood: z.boolean().default(true),
    search_web: z.boolean().default(true),
    prepare_assistant_canvas: z.boolean().default(true),
    show_assistant_canvas: z.boolean().default(true),
    control_music: z.boolean().default(true),
    search_spotify: z.boolean().default(true),
    get_spotify_queue: z.boolean().default(true),
    list_spotify_playlists: z.boolean().default(true),
    play_spotify_item: z.boolean().default(true),
    add_spotify_to_queue: z.boolean().default(true),
    set_tablet_volume: z.boolean().default(true),
    adjust_tablet_volume: z.boolean().default(true),
    send_notification: z.boolean().default(true),
    speak_on_tablet: z.boolean().default(true),
    start_live_conversation: z.boolean().default(true),
    set_view_brightness: z.boolean().default(true),
    search_home_entities: z.boolean().default(true),
    get_home_entity: z.boolean().default(true),
    list_schedules: z.boolean().default(true), create_timer: z.boolean().default(true), create_alarm: z.boolean().default(true), create_assistant_task: z.boolean().default(true),
    set_alarm_enabled: z.boolean().default(true), cancel_schedule: z.boolean().default(true), dismiss_schedule: z.boolean().default(true), snooze_schedule: z.boolean().default(true),
  }).default({
    get_status: true, get_current_time: true, show_view: true, show_assistant_mood: true, search_web: true, prepare_assistant_canvas: true, show_assistant_canvas: true, control_music: true, search_spotify: true, get_spotify_queue: true, list_spotify_playlists: true, play_spotify_item: true, add_spotify_to_queue: true,
    set_tablet_volume: true, adjust_tablet_volume: true, send_notification: true, speak_on_tablet: true, start_live_conversation: true, set_view_brightness: true,
    search_home_entities: true, get_home_entity: true,
    list_schedules: true, create_timer: true, create_alarm: true, create_assistant_task: true, set_alarm_enabled: true, cancel_schedule: true, dismiss_schedule: true, snooze_schedule: true,
  }),
}).default({
  enabled: false,
  tools: {
    get_status: true, get_current_time: true, show_view: true, show_assistant_mood: true, search_web: true, prepare_assistant_canvas: true, show_assistant_canvas: true, control_music: true, search_spotify: true, get_spotify_queue: true, list_spotify_playlists: true, play_spotify_item: true, add_spotify_to_queue: true,
    set_tablet_volume: true, adjust_tablet_volume: true, send_notification: true, speak_on_tablet: true, start_live_conversation: true, set_view_brightness: true,
    search_home_entities: true, get_home_entity: true,
    list_schedules: true, create_timer: true, create_alarm: true, create_assistant_task: true, set_alarm_enabled: true, cancel_schedule: true, dismiss_schedule: true, snooze_schedule: true,
  },
});
export const assistantBrightnessSchema = z.object({
  globalEnabled: z.boolean().default(true),
  overrides: z.partialRecord(assistantStateSchema, z.number().min(.05).max(1).nullable()).default({ sleep: .05 }),
}).default({ globalEnabled: true, overrides: { sleep: .05 } });

export const openAiReasoningSchema = z.enum(["low", "medium", "high"]);
export const openAiVoiceSchema = z.enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse", "marin", "cedar"]);
export const assistantVoiceProviderSchema = z.enum(["openai-live", "openai-tts", "elevenlabs"]);
export const assistantConversationModeSchema = z.enum(["gpt-live", "luna-pipeline"]);
export const aiAssistantSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  primaryModel: z.string().trim().min(1).max(80).default("gpt-6-luna"),
  primaryReasoning: openAiReasoningSchema.default("medium"),
  escalationEnabled: z.boolean().default(true),
  fallbackModel: z.string().trim().min(1).max(80).default("gpt-6.1-sol"),
  fallbackReasoning: openAiReasoningSchema.default("medium"),
  maxTurns: z.number().int().min(2).max(12).default(6),
  systemPrompt: z.string().trim().min(1).max(4_000).default("Jesteś domowym asystentem WallDeck. Odpowiadaj po polsku, krótko i konkretnie. Korzystaj z narzędzi MCP, gdy użytkownik prosi o działanie lub aktualny stan. Nie zgaduj wyniku narzędzia i nie ogłaszaj sukcesu, zanim narzędzie go nie potwierdzi. Jeżeli polecenie jest niejasne albo nie potrafisz go bezpiecznie wykonać, rozpocznij odpowiedź od ESCALATE:."),
  voice: z.object({
    enabled: z.boolean().default(false),
    conversationMode: assistantConversationModeSchema.default("gpt-live"),
    provider: assistantVoiceProviderSchema.default("openai-live"),
    model: z.string().trim().min(1).max(80).default("gpt-4o-mini-tts"),
    voice: openAiVoiceSchema.default("coral"),
    instructions: z.string().trim().max(500).default("Mów spokojnie, naturalnie i ciepło po polsku."),
    live: z.object({
      model: z.string().trim().min(1).max(80).default("gpt-live-1"),
      voice: openAiVoiceSchema.default("marin"),
      monthlyBudgetUsd: z.number().min(1).max(500).default(15),
      idleCloseMs: z.number().int().min(750).max(10_000).default(2_000),
      hardLimitSeconds: z.number().int().min(10).max(120).default(90),
      fallbackToTts: z.boolean().default(true),
      conversationEnabled: z.boolean().default(true),
      wakeWordEnabled: z.boolean().default(true),
      wakePhrase: z.string().trim().min(2).max(40).default("Ej Waldek"),
      wakeConfidenceThreshold: z.number().min(.5).max(.98).default(.78),
      speakerObservationEnabled: z.boolean().default(true),
    }).default({ model: "gpt-live-1", voice: "marin", monthlyBudgetUsd: 15, idleCloseMs: 2_000, hardLimitSeconds: 90, fallbackToTts: true, conversationEnabled: true, wakeWordEnabled: true, wakePhrase: "Ej Waldek", wakeConfidenceThreshold: .78, speakerObservationEnabled: true }),
    pipeline: z.object({
      transcriptionModel: z.string().trim().min(1).max(80).default("gpt-4o-mini-transcribe"),
      endOfTurnMs: z.number().int().min(750).max(5_000).default(1_500),
      maxInputSeconds: z.number().int().min(5).max(45).default(20),
    }).default({ transcriptionModel: "gpt-4o-mini-transcribe", endOfTurnMs: 1_500, maxInputSeconds: 20 }),
    elevenLabs: z.object({
      model: z.preprocess(value => value === "eleven_v3_conversational" ? "eleven_multilingual_v2" : value, z.string().trim().min(1).max(100).default("eleven_multilingual_v2")),
      voiceId: z.string().trim().max(200).default(""),
    }).default({ model: "eleven_multilingual_v2", voiceId: "" }),
  }).default({
    enabled: false,
    conversationMode: "gpt-live",
    provider: "openai-live",
    model: "gpt-4o-mini-tts",
    voice: "coral",
    instructions: "Mów spokojnie, naturalnie i ciepło po polsku.",
    live: { model: "gpt-live-1", voice: "marin", monthlyBudgetUsd: 15, idleCloseMs: 2_000, hardLimitSeconds: 90, fallbackToTts: true, conversationEnabled: true, wakeWordEnabled: true, wakePhrase: "Ej Waldek", wakeConfidenceThreshold: .78, speakerObservationEnabled: true },
    pipeline: { transcriptionModel: "gpt-4o-mini-transcribe", endOfTurnMs: 1_500, maxInputSeconds: 20 },
    elevenLabs: { model: "eleven_multilingual_v2", voiceId: "" },
  }),
}).default({
  enabled: false,
  primaryModel: "gpt-6-luna",
  primaryReasoning: "medium",
  escalationEnabled: true,
  fallbackModel: "gpt-6.1-sol",
  fallbackReasoning: "medium",
  maxTurns: 6,
  systemPrompt: "Jesteś domowym asystentem WallDeck. Odpowiadaj po polsku, krótko i konkretnie. Korzystaj z narzędzi MCP, gdy użytkownik prosi o działanie lub aktualny stan. Nie zgaduj wyniku narzędzia i nie ogłaszaj sukcesu, zanim narzędzie go nie potwierdzi. Jeżeli polecenie jest niejasne albo nie potrafisz go bezpiecznie wykonać, rozpocznij odpowiedź od ESCALATE:.",
  voice: {
    enabled: false,
    conversationMode: "gpt-live",
    provider: "openai-live",
    model: "gpt-4o-mini-tts",
    voice: "coral",
    instructions: "Mów spokojnie, naturalnie i ciepło po polsku.",
    live: { model: "gpt-live-1", voice: "marin", monthlyBudgetUsd: 15, idleCloseMs: 2_000, hardLimitSeconds: 90, fallbackToTts: true, conversationEnabled: true, wakeWordEnabled: true, wakePhrase: "Ej Waldek", wakeConfidenceThreshold: .78, speakerObservationEnabled: true },
    pipeline: { transcriptionModel: "gpt-4o-mini-transcribe", endOfTurnMs: 1_500, maxInputSeconds: 20 },
    elevenLabs: { model: "eleven_multilingual_v2", voiceId: "" },
  },
});
export type AiAssistantSettings = z.infer<typeof aiAssistantSettingsSchema>;
export const aiAssistantConfigInputSchema = z.object({
  settings: aiAssistantSettingsSchema,
  apiKey: z.string().trim().min(20).max(300).optional(),
  elevenLabsApiKey: z.string().trim().min(10).max(300).optional(),
});
export type AiAssistantConfigInput = z.infer<typeof aiAssistantConfigInputSchema>;
export const aiAssistantRunInputSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  forceFallback: z.boolean().default(false),
  recordHistory: z.boolean().default(true),
});
export type AiAssistantRunInput = z.infer<typeof aiAssistantRunInputSchema>;
export const aiAssistantSpeechInputSchema = z.object({ text: z.string().trim().min(1).max(500) });
export interface AiVoiceUsageStatus {
  month: string;
  liveSeconds: number;
  estimatedUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  exhausted: boolean;
  fallbackActive: boolean;
}
export interface SpeakerObservation {
  label: string;
  confidence: number;
  observedAt: string;
  experimental: true;
  engine?: "tablet-heuristic" | "silero-ecapa";
  relation?: "anchor" | "same" | "different";
  similarity?: number;
  speechSeconds?: number;
  processingMs?: number;
  fingerprintId?: string;
  anchorFingerprintId?: string;
}
export interface SpeakerObserverStatus { available: boolean; engine: "silero-ecapa"; modelReady: boolean; detail?: string; }
export interface ElevenLabsVoice { voiceId: string; name: string; category?: string; labels: Record<string, string>; verifiedLanguages: string[]; }
export interface AiAssistantStatus { configured: boolean; elevenLabsConfigured: boolean; enabled: boolean; toolsReady: boolean; mcpReady: boolean; busy: boolean; voiceUsage: AiVoiceUsageStatus; speakerObservation: SpeakerObservation | null; speakerObserver: SpeakerObserverStatus; }
export interface AiAssistantToolTrace { name: string; arguments: unknown; output?: unknown; }
export interface AiAssistantModelTurn { model: string; input: string; instructions: string; output?: string; error?: string; toolCalls: AiAssistantToolTrace[]; }
export interface AiAssistantRunResult { text: string; model: string; escalated: boolean; toolCalls: AiAssistantToolTrace[]; modelTurns: AiAssistantModelTurn[]; durationMs: number; }
export interface AiAssistantLiveTranscriptSegment {
  role: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
  interrupted?: boolean;
}
export interface AiAssistantLiveToolTrace extends AiAssistantToolTrace {
  callId: string;
  delegationId: string;
  startedAt: string;
  completedAt: string;
  error?: string;
}
export interface AiAssistantLiveDelegationTrace {
  delegationId: string | null;
  startedAt: string;
  completedAt: string;
  result: string;
  model?: string;
  durationMs?: number;
  error?: string;
  toolCalls: AiAssistantToolTrace[];
}
export interface AiAssistantLiveSessionTrace {
  sessionId?: string;
  model: string;
  durationMs: number;
  usageSeconds: number;
  closeReason: string;
  transcript: AiAssistantLiveTranscriptSegment[];
  toolCalls: AiAssistantLiveToolTrace[];
  delegations: AiAssistantLiveDelegationTrace[];
  speakerObservations: SpeakerObservation[];
}
export interface AiAssistantConversationEntry {
  id: string;
  source: "tablet-voice" | "tablet-live" | "admin-text" | "scheduled-task";
  startedAt: string;
  completedAt: string;
  transcript: string;
  result?: AiAssistantRunResult;
  liveSession?: AiAssistantLiveSessionTrace;
  error?: string;
}

export const ambientSleepSchema = z.object({
  enabled: z.boolean(),
  source: z.enum(["home-assistant", "android-sensor", "camera"]).default("home-assistant"),
  homeAssistantEntityId: z.string().trim().max(255).regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i).nullable().default(null),
  homeAssistantSleepBelow: z.number().finite().default(5),
  homeAssistantResetAbove: z.number().finite().default(15),
  sleepEntryDelaySeconds: z.number().min(0.3).max(10).default(1.6),
  sleepBelowLux: z.number().min(0).max(10_000),
  resetAboveLux: z.number().min(0).max(10_000),
  cameraEnabled: z.boolean().default(true),
  cameraSleepBelowPercent: z.number().min(0).max(100).default(5),
  cameraResetAbovePercent: z.number().min(0).max(100).default(15),
  cameraSampleSeconds: z.number().int().min(10).max(300).default(30),
}).refine((value) => value.resetAboveLux > value.sleepBelowLux, {
  message: "Próg wybudzenia musi być wyższy od progu snu",
  path: ["resetAboveLux"],
}).refine((value) => value.cameraResetAbovePercent > value.cameraSleepBelowPercent, {
  message: "Próg wybudzenia kamery musi być wyższy od progu snu",
  path: ["cameraResetAbovePercent"],
}).refine((value) => value.homeAssistantResetAbove > value.homeAssistantSleepBelow, {
  message: "Próg ponownego uzbrojenia encji HA musi być wyższy od progu snu",
  path: ["homeAssistantResetAbove"],
}).default({ enabled: true, source: "home-assistant", homeAssistantEntityId: null, homeAssistantSleepBelow: 5, homeAssistantResetAbove: 15, sleepEntryDelaySeconds: 1.6, sleepBelowLux: 5, resetAboveLux: 15, cameraEnabled: false, cameraSleepBelowPercent: 5, cameraResetAbovePercent: 15, cameraSampleSeconds: 30 });

export const viewIdSchema = z.preprocess(value => value === "assistant-demo" ? "assistant-expressive" : value, z.enum(["photos", "ha", "assistant-expressive", "assistant-canvas", "music", "timers"]));
export type ViewId = z.infer<typeof viewIdSchema>;

export const viewRouterSettingsSchema = z.object({
  tapAction: z.object({
    enabled: z.boolean(),
    sourceView: viewIdSchema,
    targetView: viewIdSchema,
  }),
  swipeDownAction: z.object({
    enabled: z.boolean(),
    sourceView: viewIdSchema,
    targetView: viewIdSchema,
  }).default({ enabled: true, sourceView: "photos", targetView: "ha" }),
  inactivityAction: z.object({
    enabled: z.boolean(),
    sourceView: viewIdSchema.default("ha"),
    seconds: z.number().int().min(5).max(3600),
    targetView: viewIdSchema,
    showAssistantIdleBeforePhotos: z.boolean().default(true),
    assistantIdleSeconds: z.number().int().min(3).max(300).default(10),
  }),
}).default({
  tapAction: { enabled: true, sourceView: "photos", targetView: "ha" },
  swipeDownAction: { enabled: true, sourceView: "photos", targetView: "ha" },
  inactivityAction: { enabled: true, sourceView: "ha", seconds: 30, targetView: "photos", showAssistantIdleBeforePhotos: true, assistantIdleSeconds: 10 },
});

export const overlayPositionSchema = z.enum([
  "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right",
]);

export const settingsSchema = z.object({
  gallery: z.object({ holdMilliseconds: z.number().int().min(500).max(1500), notifyNewPhotos: z.boolean() }).default({ holdMilliseconds: 600, notifyNewPhotos: true }),
  notifications: z.object({
    normal: z.object({ durationSeconds: z.number().int().min(2).max(60), sound: z.enum(["none", "soft", "chime"]) }),
    alarm: z.object({ persistent: z.boolean(), durationSeconds: z.number().int().min(5).max(600), sound: z.enum(["none", "alarm"]) }),
    volume: z.number().min(0.05).max(1),
    ttsEnabled: z.literal(false).default(false),
  }).default({ normal: { durationSeconds: 5, sound: "none" }, alarm: { persistent: true, durationSeconds: 30, sound: "alarm" }, volume: .35, ttsEnabled: false }),
  mcp: mcpSettingsSchema,
  aiAssistant: aiAssistantSettingsSchema,
  tabletMenu: z.object({ enabled: z.boolean().default(true), showHandle: z.boolean().default(false), views: z.array(z.enum(["photos", "ha", "music", "assistant-expressive", "assistant-canvas", "timers"])).min(1).max(6).refine(v => new Set(v).size === v.length).default(["photos", "ha", "timers", "music", "assistant-expressive"]) }).default({ enabled: true, showHandle: false, views: ["photos", "ha", "timers", "music", "assistant-expressive"] }),
  music: z.object({ clientId: z.string().trim().regex(/^([a-fA-F0-9]{32})?$/).default("") }).default({ clientId: "" }),
  photoIntervalSeconds: z.number().int().min(10).max(3600),
  transitionSeconds: z.number().min(0.3).max(5),
  viewBrightness: z.object({
    photos: z.number().min(0.05).max(1).default(0.75),
    ha: z.number().min(0.05).max(1).default(0.85),
    music: z.number().min(0.05).max(1).default(0.65),
    "assistant-expressive": z.number().min(0.05).max(1).default(0.65),
    "assistant-canvas": z.number().min(0.05).max(1).default(0.75),
    timers: z.number().min(0.05).max(1).default(0.75),
  }).default({ photos: 0.75, ha: 0.85, music: 0.65, "assistant-expressive": 0.65, "assistant-canvas": 0.75, timers: 0.75 }),
  viewRouter: viewRouterSettingsSchema,
  assistantBrightness: assistantBrightnessSchema,
  ambientSleep: ambientSleepSchema,
  overlay: z.object({
    position: overlayPositionSchema,
    showClock: z.boolean(),
    showDate: z.boolean(),
    showWeather: z.boolean(),
    showHomeAssistantPlaceholder: z.boolean(),
    weatherLocation: z.object({
      label: z.string().max(80),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
    }),
  }),
});

export type WallDeckSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: WallDeckSettings = {
  gallery: { holdMilliseconds: 600, notifyNewPhotos: true },
  notifications: { normal: { durationSeconds: 5, sound: "none" }, alarm: { persistent: true, durationSeconds: 30, sound: "alarm" }, volume: .35, ttsEnabled: false },
  mcp: mcpSettingsSchema.parse(undefined),
  aiAssistant: aiAssistantSettingsSchema.parse(undefined),
  tabletMenu: { enabled: true, showHandle: false, views: ["photos", "ha", "timers", "music", "assistant-expressive"] },
  music: { clientId: "" },
  photoIntervalSeconds: 30,
  transitionSeconds: 1.4,
  viewBrightness: { photos: 0.75, ha: 0.85, music: 0.65, "assistant-expressive": 0.65, "assistant-canvas": 0.75, timers: 0.75 },
  assistantBrightness: { globalEnabled: true, overrides: { sleep: .05 } },
  ambientSleep: { enabled: true, source: "home-assistant", homeAssistantEntityId: null, homeAssistantSleepBelow: 5, homeAssistantResetAbove: 15, sleepEntryDelaySeconds: 1.6, sleepBelowLux: 5, resetAboveLux: 15, cameraEnabled: false, cameraSleepBelowPercent: 5, cameraResetAbovePercent: 15, cameraSampleSeconds: 30 },
  viewRouter: {
    tapAction: { enabled: true, sourceView: "photos", targetView: "ha" },
    swipeDownAction: { enabled: true, sourceView: "photos", targetView: "ha" },
    inactivityAction: { enabled: true, sourceView: "ha", seconds: 30, targetView: "photos", showAssistantIdleBeforePhotos: true, assistantIdleSeconds: 10 },
  },
  overlay: {
    position: "bottom-left",
    showClock: true,
    showDate: true,
    showWeather: true,
    showHomeAssistantPlaceholder: false,
    weatherLocation: { label: "Dom", latitude: null, longitude: null },
  },
};

export interface PhotoItem {
  edit?: PhotoEdit;
  thumbnailUrl?: string;
  id: string;
  url: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
}

export const photoCropSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(4) });
export const photoEditSchema = z.object({ rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]), hidden: z.boolean(), landscape: photoCropSchema, portrait: photoCropSchema });
export type PhotoEdit = z.infer<typeof photoEditSchema>;
export const defaultPhotoEdit: PhotoEdit = { rotation: 0, hidden: false, landscape: { x: .5, y: .5, zoom: 1 }, portrait: { x: .5, y: .5, zoom: 1 } };
export interface PhotoSyncStatus { running: boolean; lastSyncAt: string | null; error: string | null; downloaded: number; }
export const notificationSoundSchema = z.enum(["none", "soft", "chime", "alarm"]);
export type NotificationSound = z.infer<typeof notificationSoundSchema>;
export const notificationPreviewSchema = z.object({
  priority: z.enum(["normal", "alarm"]),
  persistent: z.boolean(),
  durationMs: z.number().int().min(1000).max(600_000),
  sound: notificationSoundSchema,
  volume: z.number().min(.05).max(1),
});
export type NotificationPreview = z.infer<typeof notificationPreviewSchema>;
export interface AppNotification {
  id: string;
  message: string;
  kind: "info" | "success" | "error";
  priority?: "normal" | "alarm";
  action?: "photos";
  durationMs?: number;
  persistent?: boolean;
  sound?: NotificationSound;
  volume?: number;
  ttsText?: string;
}

export const scheduleAutomationPromptSchema = z.string().trim().max(1_000).default("");
export const timerInputSchema = z.object({
  durationSeconds: z.number().int().min(1).max(604_800),
  label: z.string().trim().max(100).default(""),
  automationPrompt: scheduleAutomationPromptSchema,
});
export const alarmInputSchema = z.object({
  label: z.string().trim().max(100).default(""),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([]).transform(days => [...new Set(days)].sort()),
  triggerAt: z.string().datetime({ offset: true }).optional(),
  automationPrompt: scheduleAutomationPromptSchema,
}).refine(value => value.triggerAt || (value.time && value.repeatDays.length > 0), { message: "Podaj termin jednorazowy albo godzinę i dni powtarzania" });
export const assistantTaskInputSchema = z.object({
  label: z.string().trim().max(100).default(""),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  repeatDays: z.array(z.number().int().min(0).max(6)).max(7).default([]).transform(days => [...new Set(days)].sort()),
  triggerAt: z.string().datetime({ offset: true }).optional(),
  automationPrompt: z.string().trim().min(1, "Podaj instrukcję dla asystenta").max(1_000),
}).refine(value => value.triggerAt || (value.time && value.repeatDays.length > 0), { message: "Podaj termin jednorazowy albo godzinę i dni powtarzania" });
export const snoozeInputSchema = z.object({ minutes: z.number().int().min(1).max(180).default(10) });
export type TimerInput = z.infer<typeof timerInputSchema>;
export type AlarmInput = z.infer<typeof alarmInputSchema>;
export type AssistantTaskInput = z.infer<typeof assistantTaskInputSchema>;
export const diagnosticLevelSchema = z.enum(["info", "warning", "error"]);
export const diagnosticCategorySchema = z.enum(["tablet", "assistant", "scheduler", "home-assistant", "client", "server"]);
export const diagnosticEntryInputSchema = z.object({
  level: diagnosticLevelSchema,
  category: diagnosticCategorySchema,
  title: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(2_000),
  details: z.string().trim().max(6_000).optional(),
  deviceId: z.string().trim().max(128).optional(),
});
export type DiagnosticEntryInput = z.infer<typeof diagnosticEntryInputSchema>;
export interface DiagnosticEntry extends DiagnosticEntryInput { id: string; timestamp: string; }
export const assistantCanvasMetricSchema = z.object({
  label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(20).optional(), note: z.string().trim().max(100).optional(),
  tone: z.enum(["neutral", "good", "warning", "danger"]).default("neutral"),
});
export const assistantCanvasChartSchema = z.object({
  title: z.string().trim().min(1).max(100), unit: z.string().trim().max(20).optional(),
  points: z.array(z.object({ label: z.string().trim().min(1).max(50), value: z.number().finite() })).min(2).max(16),
});
export const assistantCanvasImageSchema = z.object({
  url: z.string().url().max(2_000).refine(value => value.startsWith("https://"), "Obraz musi używać HTTPS"), alt: z.string().trim().min(1).max(180),
  caption: z.string().trim().max(180).optional(), sourceUrl: z.string().url().max(2_000).refine(value => /^https?:\/\//.test(value), "Źródło musi używać HTTP lub HTTPS").optional(),
});
export const assistantCanvasSourceSchema = z.object({ title: z.string().trim().min(1).max(180), url: z.string().url().max(2_000).refine(value => /^https?:\/\//.test(value), "Źródło musi używać HTTP lub HTTPS") });
export const assistantCanvasInputSchema = z.object({
  eyebrow: z.string().trim().max(50).optional(), title: z.string().trim().min(1).max(140),
  summary: z.string().trim().max(1_200).optional(),
  metrics: z.array(assistantCanvasMetricSchema).max(12).default([]),
  charts: z.array(assistantCanvasChartSchema).max(4).default([]),
  bullets: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  images: z.array(assistantCanvasImageSchema).max(6).default([]),
  sources: z.array(assistantCanvasSourceSchema).max(10).default([]),
});
export type AssistantCanvasInput = z.infer<typeof assistantCanvasInputSchema>;
export interface AssistantCanvasDocument extends AssistantCanvasInput { id: string; updatedAt: string; revision?: number; status?: "preparing" | "ready" | "error"; imagesStatus?: "loading" | "ready" | "unavailable"; }
export interface ScheduledItem {
  id: string;
  kind: "timer" | "alarm" | "task";
  label: string;
  automationPrompt: string;
  createdAt: string;
  triggerAt: string;
  durationSeconds?: number;
  time?: string;
  repeatDays: number[];
  enabled: boolean;
  status: "scheduled" | "ringing" | "automation" | "completed" | "error";
  lastTriggeredAt?: string;
  automationResult?: string;
  lastAutomationSucceeded?: boolean;
}

export interface WeatherNow {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  isDay: boolean;
  label: string;
  observedAt: string;
}

export const homeAssistantOverlayItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  entityId: z.string().trim().min(1).max(255).regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i),
  label: z.string().trim().max(80),
  position: overlayPositionSchema,
});

export type HomeAssistantOverlayItem = z.infer<typeof homeAssistantOverlayItemSchema>;

export const homeAssistantConfigInputSchema = z.object({
  baseUrl: z.string().trim().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Dozwolony jest tylko adres HTTP lub HTTPS"),
  token: z.string().max(8192).optional(),
  dashboardUrl: z.string().trim().max(2048).refine((value) => value === "" || z.string().url().safeParse(value).success, "Nieprawidłowy adres dashboardu"),
  overlayEntities: z.array(homeAssistantOverlayItemSchema).max(24).default([]),
  co2EntityId: z.string().trim().max(255).nullable().optional(),
});

export type HomeAssistantConfigInput = z.infer<typeof homeAssistantConfigInputSchema>;

export interface HomeAssistantStatus {
  configured: boolean;
  connected: boolean;
  baseUrl: string;
  dashboardUrl: string;
  overlayEntities: HomeAssistantOverlayItem[];
  version: string | null;
  entityCount: number;
  lastError: string | null;
}

export interface HomeAssistantEntity {
  entityId: string;
  state: string;
  friendlyName: string;
  unit: string | null;
  deviceClass: string | null;
  lastChanged: string | null;
}

export interface HomeAssistantSelectedState {
  id: string;
  entityId: string;
  state: string;
  friendlyName: string;
  label: string;
  position: z.infer<typeof overlayPositionSchema>;
  unit: string | null;
  updatedAt: string | null;
}

export const deviceSensorSchema = z.object({
  name: z.string().max(160),
  vendor: z.string().max(160),
  type: z.number().int(),
  stringType: z.string().max(200),
  version: z.number().int(),
  reportingMode: z.number().int(),
  wakeUp: z.boolean(),
  power: z.number().finite(),
  resolution: z.number().finite(),
  maximumRange: z.number().finite(),
  minDelayUs: z.number().int(),
  maxDelayUs: z.number().int(),
  fifoMaxEventCount: z.number().int().nonnegative(),
  fifoReservedEventCount: z.number().int().nonnegative(),
  requiredPermission: z.string().max(200).nullable(),
  value: z.number().finite().nullable().optional(),
  unit: z.string().max(32).nullable().optional(),
});

export type DeviceSensor = z.infer<typeof deviceSensorSchema>;

export const deviceReportSchema = z.object({
  deviceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  manufacturer: z.string().max(160),
  model: z.string().max(160),
  android: z.string().max(80),
  sdk: z.number().int().positive(),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    densityDpi: z.number().int().positive(),
  }),
  appVersion: z.object({ name: z.string().max(80), code: z.number().int().nonnegative() }),
  battery: z.object({ percent: z.number().int().min(-1).max(100), powerConnected: z.boolean(), charging: z.boolean() }),
  permissions: z.object({
    overlay: z.boolean(),
    notifications: z.boolean(),
    microphone: z.boolean(),
    camera: z.boolean(),
    activityRecognition: z.boolean(),
  }),
  sensors: z.array(deviceSensorSchema).max(128),
});

export type DeviceReport = z.infer<typeof deviceReportSchema>;
export type DeviceStatus = DeviceReport & { lastSeen: string; online: boolean };
