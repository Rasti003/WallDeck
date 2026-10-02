import assert from "node:assert/strict";
import test from "node:test";
import { shouldEndSpeakerTurn } from "../dist/luna-conversation.js";

test("Luna ends after the anchored speaker stops even when another voice continues", () => {
  assert.equal(shouldEndSpeakerTurn({
    anchorReady: true,
    elapsedSinceMatchingMs: 1_600,
    endOfTurnMs: 1_500,
    recentSpeech: true,
    currentSpeakerMatches: false,
  }), true);
});

test("Luna keeps listening while the anchored speaker is still active", () => {
  assert.equal(shouldEndSpeakerTurn({
    anchorReady: true,
    elapsedSinceMatchingMs: 2_000,
    endOfTurnMs: 1_500,
    recentSpeech: true,
    currentSpeakerMatches: true,
  }), false);
});

test("Luna waits for the configured end-of-turn delay", () => {
  assert.equal(shouldEndSpeakerTurn({
    anchorReady: true,
    elapsedSinceMatchingMs: 900,
    endOfTurnMs: 1_500,
    recentSpeech: false,
    currentSpeakerMatches: true,
  }), false);
});
