import assert from "node:assert/strict";
import test from "node:test";
import { appendLiveTranscript, filterLivePcm, LIVE_NATURAL_PAUSE_BYTES } from "../dist/live-conversation.js";

test("GPT-Live transcript groups consecutive deltas and preserves speaker changes", () => {
  const transcript = [];
  appendLiveTranscript(transcript, "user", "Włącz", 100, 300);
  appendLiveTranscript(transcript, "user", " światło", 310, 620);
  appendLiveTranscript(transcript, "assistant", "Już", 700, 900);
  appendLiveTranscript(transcript, "user", " stop", 850, 1_000);

  assert.deepEqual(transcript, [
    { role: "user", text: "Włącz światło", startMs: 100, endMs: 620 },
    { role: "assistant", text: "Już", startMs: 700, endMs: 900 },
    { role: "user", text: " stop", startMs: 850, endMs: 1_000 },
  ]);
});

test("live audio keeps only a short PCM pause regardless of packet arrival speed", () => {
  const silence = Buffer.alloc(LIVE_NATURAL_PAUSE_BYTES * 3);
  const first = filterLivePcm(silence, 0);
  assert.equal(first.audio.length, LIVE_NATURAL_PAUSE_BYTES);
  assert.equal(first.droppedBytes, LIVE_NATURAL_PAUSE_BYTES * 2);

  const next = filterLivePcm(Buffer.alloc(4_800), first.trailingSilenceBytes);
  assert.equal(next.audio.length, 0);
  assert.equal(next.droppedBytes, 4_800);

  const speech = Buffer.alloc(4_800);
  for (let offset = 0; offset < speech.length; offset += 2) speech.writeInt16LE(2_000, offset);
  const resumed = filterLivePcm(speech, next.trailingSilenceBytes);
  assert.equal(resumed.audible, true);
  assert.equal(resumed.trailingSilenceBytes, 0);
});
