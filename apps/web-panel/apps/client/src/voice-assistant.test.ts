import { expect, it, vi } from "vitest";
import { delegatedCommandWithContext } from "./voice-delegation";
import { VoiceAssistantRuntime } from "./voice-assistant";
import { defaultSettings } from "@walldeck/contracts";
import { api } from "./api";
vi.mock("./api", () => ({ api: { assistant: { run: vi.fn() } } }));
vi.mock("./native", () => ({ nativeBridge: { available: false, call: vi.fn() } }));

it("preserves earlier corrections when GPT-Live delegates after starting its reply", () => {
  const command = delegatedCommandWithContext("Muzyka do nauki. Nie, do pracy. Wybierz jedną i włącz.");
  expect(command).toContain("Muzyka do nauki");
  expect(command).toContain("Nie, do pracy");
  expect(command).toContain("Wybierz jedną i włącz");
});

it("does not invent a second delegation after a partial transcript or silence", async () => {
  vi.useFakeTimers();
  const run = vi.spyOn(api.assistant, "run");
  try {
    const runtime = new VoiceAssistantRuntime(defaultSettings.aiAssistant, { setState: vi.fn(), showAssistant: vi.fn(), hideAssistant: vi.fn() });
    await (runtime as any).handleMessage({ type: "inputTranscript", delta: "Opowiedz o psach rasy" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).not.toHaveBeenCalled();
    await (runtime as any).handleMessage({ type: "inputTranscript", delta: " husky" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).not.toHaveBeenCalled();
  } finally { run.mockRestore(); vi.useRealTimers(); }
});
