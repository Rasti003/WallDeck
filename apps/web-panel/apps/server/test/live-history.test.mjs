import assert from "node:assert/strict";
import test from "node:test";
import { appendLiveTranscript } from "../dist/live-conversation.js";

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
