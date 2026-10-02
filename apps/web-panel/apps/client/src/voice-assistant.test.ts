import { expect, it } from "vitest";
import { delegatedCommandWithContext } from "./voice-delegation";

it("preserves earlier corrections when GPT-Live delegates after starting its reply", () => {
  const command = delegatedCommandWithContext("Muzyka do nauki. Nie, do pracy. Wybierz jedną i włącz.");
  expect(command).toContain("Muzyka do nauki");
  expect(command).toContain("Nie, do pracy");
  expect(command).toContain("Wybierz jedną i włącz");
});
