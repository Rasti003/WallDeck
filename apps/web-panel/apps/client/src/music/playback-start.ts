import type { MusicState } from "@walldeck/contracts";

// Disconnects carry cached player data: only connected snapshots establish edges.
export function createPlaybackStartDetector() {
  let playing = false;
  return (state: MusicState): boolean => {
    if (state.connection !== "connected" || !state.track) return false;
    const next = !state.paused;
    const started = next && !playing;
    playing = next;
    return started;
  };
}
