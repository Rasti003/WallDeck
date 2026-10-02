import { z } from "zod";
import type { DeviceStatus, McpToolId, SpotifyItem, SpotifyStatus } from "@walldeck/contracts";
import type { FunctionTool } from "openai/resources/live/live";
import { currentTimeSnapshot } from "./current-time.js";

export type LiveToolDependencies = {
  currentView(): string;
  devices(): DeviceStatus[];
  spotifyStatus(): SpotifyStatus;
  searchSpotify(query: string, types?: SpotifyItem["type"][]): Promise<SpotifyItem[]>;
  activateView(view: "photos" | "ha" | "assistant-expressive" | "music"): void;
  panelCommand(name: string, args: Record<string, unknown>): Promise<unknown>;
};

const definitions: Record<string, FunctionTool> = {
  get_status: { type: "function", name: "get_status", description: "Odczytuje aktywny widok, tablet i stan Spotify.", strict: true, parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  get_current_time: { type: "function", name: "get_current_time", description: "Zwraca dokładną bieżącą datę, godzinę, dzień tygodnia i przesunięcie UTC dla domu w strefie Europe/Warsaw. Użyj zawsze, gdy odpowiedź lub działanie zależy od słów: teraz, dziś, jutro, godzina, data albo termin.", strict: true, parameters: { type: "object", properties: {}, required: [], additionalProperties: false } },
  show_view: { type: "function", name: "show_view", description: "Przełącza widok WallDeck.", strict: true, parameters: { type: "object", properties: { view: { type: "string", enum: ["photos", "ha", "assistant-expressive", "music"] } }, required: ["view"], additionalProperties: false } },
  control_music: { type: "function", name: "control_music", description: "Steruje aktualnym odtwarzaniem Spotify.", strict: true, parameters: { type: "object", properties: { action: { type: "string", enum: ["play", "pause", "next", "previous"] } }, required: ["action"], additionalProperties: false } },
  search_spotify: { type: "function", name: "search_spotify", description: "Wyszukuje Spotify. Użyj przed wybraniem muzyki, gdy użytkownik nie podał URI.", strict: true, parameters: { type: "object", properties: { query: { type: "string" }, types: { type: "array", items: { type: "string", enum: ["track", "album", "artist", "playlist", "episode"] } } }, required: ["query", "types"], additionalProperties: false } },
  play_spotify_item: { type: "function", name: "play_spotify_item", description: "Uruchamia znaleziony utwór, album, artystę lub playlistę Spotify na tablecie.", strict: true, parameters: { type: "object", properties: { uri: { type: "string", pattern: "^spotify:(track|album|artist|playlist|episode|show):[A-Za-z0-9]+$" } }, required: ["uri"], additionalProperties: false } },
  set_tablet_volume: { type: "function", name: "set_tablet_volume", description: "Ustawia bezwzględną głośność multimediów tabletu w procentach.", strict: true, parameters: { type: "object", properties: { percent: { type: "number", minimum: 0, maximum: 100 } }, required: ["percent"], additionalProperties: false } },
  adjust_tablet_volume: { type: "function", name: "adjust_tablet_volume", description: "Zmienia obecną głośność multimediów względnie. Dla „podgłośnij” użyj +10, dla „ścisz” -10, jeśli użytkownik nie podał wartości.", strict: true, parameters: { type: "object", properties: { deltaPercent: { type: "number", minimum: -50, maximum: 50 } }, required: ["deltaPercent"], additionalProperties: false } },
};

export function liveTools(enabled: Record<McpToolId, boolean>): FunctionTool[] {
  return Object.values(definitions).filter(tool => enabled[tool.name as McpToolId] !== false);
}

const spotifyTypes = z.array(z.enum(["track", "album", "artist", "playlist", "episode"])).min(1).max(5);

export async function executeLiveTool(name: string, rawArguments: string, deps: LiveToolDependencies): Promise<unknown> {
  const raw = JSON.parse(rawArguments) as unknown;
  if (name === "get_status") return { currentView: deps.currentView(), devices: deps.devices(), spotify: deps.spotifyStatus() };
  if (name === "get_current_time") return currentTimeSnapshot();
  if (name === "show_view") {
    const { view } = z.object({ view: z.enum(["photos", "ha", "assistant-expressive", "music"]) }).parse(raw);
    deps.activateView(view); return { ok: true, view };
  }
  if (name === "control_music") {
    const args = z.object({ action: z.enum(["play", "pause", "next", "previous"]) }).parse(raw);
    return deps.panelCommand("music.control", args);
  }
  if (name === "search_spotify") {
    const { query, types } = z.object({ query: z.string().trim().min(1).max(120), types: spotifyTypes }).parse(raw);
    return { items: await deps.searchSpotify(query, types) };
  }
  if (name === "play_spotify_item") {
    const { uri } = z.object({ uri: z.string().regex(/^spotify:(track|album|artist|playlist|episode|show):[A-Za-z0-9]+$/) }).parse(raw);
    return deps.panelCommand("music.playContext", { uri });
  }
  if (name === "set_tablet_volume") {
    const { percent } = z.object({ percent: z.number().min(0).max(100) }).parse(raw);
    return deps.panelCommand("tablet.volume", { value: percent / 100 });
  }
  if (name === "adjust_tablet_volume") {
    const { deltaPercent } = z.object({ deltaPercent: z.number().min(-50).max(50) }).parse(raw);
    return deps.panelCommand("tablet.volume.adjust", { delta: deltaPercent / 100 });
  }
  throw new Error(`Nieobsługiwane narzędzie GPT-Live: ${name}`);
}
