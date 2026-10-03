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
    "Opowiedz mi krótko o Jowiszu",
    "Opowiedz coś o rasie sfinks",
  ]) assert.equal(needsVisualDelegation(request), true, request);

  assert.equal(needsVisualDelegation("Opowiedz mi dowcip"), false);
  assert.equal(needsVisualDelegation("Która jest godzina?"), false);
});

test("Live and backend prompts make display requests mandatory", () => {
  const live = liveConversationInstructions("Baza");
  const backend = liveBackendInstructions("Baza");
  assert.match(live, /Każda prośba typu „pokaż”/);
  assert.match(live, /Nigdy nie twierdź, że nie możesz nic pokazać/);
  assert.match(live, /preferuj delegację i prezentację Canvas/);
  assert.match(live, /prawdopodobnie potrwa dłużej niż 2 sekundy/);
  assert.match(live, /2–4 prostych słów/);
  assert.match(live, /dopiero potem rozpocznij delegację/);
  assert.match(backend, /obowiązkowo zakończ zadanie wywołaniem show_assistant_canvas/);
  assert.match(backend, /krótką prezentację Canvas/);
  assert.ok(LIVE_DELEGATION_MAX_OUTPUT_TOKENS >= 1_500, "Canvas tool arguments must fit in the delegated response budget");
});
