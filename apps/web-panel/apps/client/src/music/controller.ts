import type { AudioOutputState, MusicController, MusicState } from "@walldeck/contracts";
import { nativeBridge } from "../native";

export const emptyMusicState: MusicState = {
  connection: "disconnected", installed: false, error: null, paused: true, positionMs: 0, observedAt: 0, speed: 1,
  shuffle: false, repeat: 0, context: "", artwork: null, track: null,
  capabilities: { queue: false, playlists: false, like: false, playOnDemand: false, next: false, previous: false, seek: false, shuffle: false, repeatTrack: false, repeatContext: false },
};

export function playbackPosition(state: MusicState, now: number): number {
  const elapsed = state.connection === "connected" && !state.paused ? Math.max(0, now - state.observedAt) * state.speed : 0;
  return Math.min(state.track?.durationMs ?? 0, Math.max(0, state.positionMs + elapsed));
}

// Unmounting Music never disconnects or pauses Spotify.
const command = async (action: string, args: Record<string, unknown> = {}) => {
  await nativeBridge.call("music.command", { action, ...args });
};
export const musicController: MusicController = {
  connect: async (clientId, authorize = false) => await nativeBridge.call("music.connect", { clientId, authorize }) as unknown as MusicState,
  disconnect: async () => await nativeBridge.call("music.disconnect") as unknown as MusicState,
  getPlaybackState: async () => await nativeBridge.call("music.getState") as unknown as MusicState,
  subscribePlaybackState(listener) {
    const receive = (event: Event) => listener((event as CustomEvent<MusicState>).detail);
    window.addEventListener("wallpanel:musicStateChanged", receive);
    return () => window.removeEventListener("wallpanel:musicStateChanged", receive);
  },
  play: () => command("play"), pause: () => command("pause"), next: () => command("next"), previous: () => command("previous"),
  seekTo: positionMs => command("seek", { positionMs }),
  setShuffle: enabled => command("shuffle", { enabled }), setRepeat: mode => command("repeat", { mode }),
  playContext: uri => command("playContext", { uri }), addToQueue: uri => command("addToQueue", { uri }),
  getQueue: async () => await nativeBridge.call("music.getQueue") as unknown as { supported: false; reason: string },
  getAudioOutputState: async () => await nativeBridge.call("audio.getOutputs") as unknown as AudioOutputState,
  setVolume: async value => { await nativeBridge.call("mediaVolume", { value }); },
  selectOutput: async id => await nativeBridge.call("audio.selectOutput", { id }) as unknown as { supported: false; fallback: string },
  openSystemOutputPicker: async () => { await nativeBridge.call("audio.openSystemOutputPicker"); },
};
