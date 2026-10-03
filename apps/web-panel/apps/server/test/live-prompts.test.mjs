import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_DELEGATION_MAX_OUTPUT_TOKENS, liveBackendInstructions, liveConversationInstructions, needsVisualDelegation } from "../dist/live-prompts.js";

test("detects Polish requests that should use the tablet display", () => {
  for (const request of [
    "Pokaż informacje o Jowiszu",
    "Możesz mi to pokazać?",
    "Wyświetl to na ekranie",
    "Jakie są temperatury w pomieszczeniach?",
    "Zrób wykres CO2",
  ]) assert.equal(needsVisualDelegation(request), true, request);

  assert.equal(needsVisualDelegation("Opowiedz mi krótko o Jowiszu"), false);
});

test("Live and backend prompts make display requests mandatory", () => {
  const live = liveConversationInstructions("Baza");
  const backend = liveBackendInstructions("Baza");
  assert.match(live, /Każda prośba typu „pokaż”/);
  assert.match(live, /Nigdy nie twierdź, że nie możesz nic pokazać/);
  assert.match(backend, /obowiązkowo zakończ zadanie wywołaniem show_assistant_canvas/);
  assert.ok(LIVE_DELEGATION_MAX_OUTPUT_TOKENS >= 1_500, "Canvas tool arguments must fit in the delegated response budget");
});
