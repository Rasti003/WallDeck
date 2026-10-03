import { expect, it } from "vitest";
import { delegatedCommandWithContext } from "./voice-delegation";
import { looksLikeIncompleteVoiceTurn } from "./voice-turn";

it("preserves earlier corrections when GPT-Live delegates after starting its reply", () => {
  const command = delegatedCommandWithContext("Muzyka do nauki. Nie, do pracy. Wybierz jedną i włącz.");
  expect(command).toContain("Muzyka do nauki");
  expect(command).toContain("Nie, do pracy");
  expect(command).toContain("Wybierz jedną i włącz");
});

it("waits for a missing qualifier instead of delegating an incomplete voice turn", () => {
  expect(looksLikeIncompleteVoiceTurn("Powiedz mi coś o psach rasy")).toBe(true);
  expect(looksLikeIncompleteVoiceTurn("Pokaż temperaturę w")).toBe(true);
  expect(looksLikeIncompleteVoiceTurn("Powiedz mi coś o psach rasy husky")).toBe(false);
  expect(looksLikeIncompleteVoiceTurn("Opowiedz mi coś o psach")).toBe(false);
});
