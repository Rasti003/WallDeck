import { expect, it, vi } from "vitest";
import { delegatedCommandWithContext } from "./voice-delegation";
import { VoiceAssistantRuntime } from "./voice-assistant";
import { defaultSettings } from "@walldeck/contracts";
import { api } from "./api";
import { nativeBridge } from "./native";
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

it("explicit stop drops prebuffer and stops both native streams without draining", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  vi.mocked(nativeBridge.call).mockResolvedValue(null);
  const changed = vi.fn();
  const runtime = new VoiceAssistantRuntime(defaultSettings.aiAssistant, {
    setState: vi.fn(), showAssistant: vi.fn(), hideAssistant: vi.fn(), onConversationChange: changed,
  });
  const socket = { readyState: 1, send: vi.fn(), close: vi.fn() };
  (runtime as any).socket = socket;
  (runtime as any).queueLiveAudio("AAAA");
  vi.mocked(nativeBridge.call).mockClear();
  try {
    await runtime.stopConversation();
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(null);
    const methods = vi.mocked(nativeBridge.call).mock.calls.map(call => call[0]);
    expect(methods).toContain("assistantAudio.stopInput");
    expect(methods).toContain("assistantAudio.stopOutput");
    expect(methods).not.toContain("assistantAudio.finishOutput");
    expect(methods).not.toContain("assistantAudio.appendOutput");
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it("does not append queued speech when stop interrupts native output startup", async () => {
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  let started!: (value: null) => void;
  vi.mocked(nativeBridge.call).mockImplementation(method => method === "assistantAudio.startOutput"
    ? new Promise(resolve => { started = resolve; }) : Promise.resolve(null));
  const runtime = new VoiceAssistantRuntime(defaultSettings.aiAssistant, {
    setState: vi.fn(), showAssistant: vi.fn(), hideAssistant: vi.fn(),
  });
  (runtime as any).liveAudioChunks = ["AAAA"];
  const flushing = (runtime as any).flushLiveAudio();
  await Promise.resolve();
  try {
    await runtime.stopConversation();
    started(null);
    await flushing;
    expect(vi.mocked(nativeBridge.call).mock.calls.filter(call => call[0] === "assistantAudio.appendOutput")).toHaveLength(0);
  } finally { vi.mocked(nativeBridge.call).mockReset(); vi.unstubAllGlobals(); }
});

it("stop during connection startup never opens a late WebSocket", async () => {
  vi.stubGlobal("WebSocket", vi.fn());
  let paused!: (value: null) => void;
  vi.mocked(nativeBridge.call).mockImplementation(method => method === "wakeWord.pause"
    ? new Promise(resolve => { paused = resolve; }) : Promise.resolve(null));
  const runtime = new VoiceAssistantRuntime(defaultSettings.aiAssistant, {
    setState: vi.fn(), showAssistant: vi.fn(), hideAssistant: vi.fn(),
  });
  const opening = (runtime as any).openConversation("");
  try {
    await runtime.stopConversation();
    paused(null);
    await opening;
    expect(WebSocket).not.toHaveBeenCalled();
  } finally { vi.mocked(nativeBridge.call).mockReset(); vi.unstubAllGlobals(); }
});
