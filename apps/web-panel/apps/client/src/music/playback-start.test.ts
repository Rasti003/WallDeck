import { expect, it } from "vitest";
import { emptyMusicState } from "./controller";
import { createPlaybackStartDetector } from "./playback-start";
const playing = { ...emptyMusicState, connection: "connected" as const, paused: false,
  track: { uri: "test", title: "", artist: "", album: "", durationMs: 1000 } };
it("opens on playback start, not on track changes, repeated snapshots or reconnect", () => {
  const started = createPlaybackStartDetector();
  expect(started({ ...playing, paused: true })).toBe(false);
  expect(started(playing)).toBe(true);
  expect(started(playing)).toBe(false);
  expect(started({ ...playing, track: { ...playing.track, uri: "next" } })).toBe(false);
  expect(started({ ...playing, connection: "disconnected", paused: true })).toBe(false);
  expect(started(playing)).toBe(false);
  expect(started({ ...playing, paused: true })).toBe(false);
  expect(started(playing)).toBe(true);
});
it("recognizes already playing on first connection but ignores missing tracks", () => {
  const started = createPlaybackStartDetector();
  expect(started({ ...playing, track: null })).toBe(false);
  expect(started({ ...playing, connection: "connecting" })).toBe(false);
  expect(started(playing)).toBe(true);
});
