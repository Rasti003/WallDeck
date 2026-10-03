import type { AiAssistantSettings, AssistantState } from "@walldeck/contracts";
import { api } from "./api";
import { nativeBridge } from "./native";
import { delegatedCommandWithContext } from "./voice-delegation";

type Callbacks = {
  setState(state: AssistantState): void;
  showAssistant(): void;
  hideAssistant(): void;
  playActivationSound?(): void;
  onStatus?(status: string): void;
};

type WakeEvent = { transcript?: string; remainder?: string };
type WakeCandidateEvent = { transcript?: string; phrase?: string; confidence?: number; threshold?: number; accepted?: boolean; engine?: string };
type AudioChunkEvent = { audio?: string };
type SpeakerEvent = { label?: string; confidence?: number; experimental?: boolean };

const LIVE_PREBUFFER_BYTES = 24_000;
const LIVE_PREBUFFER_MS = 350;

function compactTraceValue(value: unknown, maxCharacters: number): unknown {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxCharacters) return value;
    return { truncated: true, preview: serialized.slice(0, maxCharacters) };
  } catch {
    return { unavailable: true };
  }
}

export class VoiceAssistantRuntime {
  private socket: WebSocket | null = null;
  private inputTranscript = "";
  private lastTranscriptAt = 0;
  private outputStarted = false;
  private inputActive = false;
  private disposed = false;
  private pendingDelegations = new Set<string>();
  private pendingAudio: string[] = [];
  private sessionReady = false;
  private bufferedSpeechTask: Promise<void> | null = null;
  private nativeOutputReady = false;
  private handledTranscriptLength = 0;
  private liveAudioChunks: string[] = [];
  private liveAudioBytes = 0;
  private livePlaybackStarted = false;
  private livePrebufferTimer: ReturnType<typeof setTimeout> | null = null;
  private audioWriteChain: Promise<void> = Promise.resolve();
  private pendingUserTurn = false;

  constructor(private settings: AiAssistantSettings, private callbacks: Callbacks) {}

  async start() {
    window.addEventListener("wallpanel:wakeWordDetected", this.onWake as EventListener);
    window.addEventListener("wallpanel:wakeWordCandidate", this.onWakeCandidate as EventListener);
    window.addEventListener("wallpanel:assistantAudioChunk", this.onAudioChunk as EventListener);
    window.addEventListener("wallpanel:speakerObserved", this.onSpeaker as EventListener);
    await this.configureWake();
  }

  async updateSettings(settings: AiAssistantSettings) {
    if (settings === this.settings || this.disposed) return;
    const modeChanged = settings.voice.conversationMode !== this.settings.voice.conversationMode;
    this.settings = settings;
    if (this.socket) {
      if (modeChanged) {
        if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "close" }));
        this.socket.close();
      }
      return;
    }
    await this.configureWake();
  }

  async speakOnTablet(text: string) {
    const spoken = text.trim();
    if (!nativeBridge.available) throw new Error("Głos jest dostępny tylko na tablecie WallDeck");
    if (!this.settings.enabled || !this.settings.voice.enabled) throw new Error("Głos asystenta jest wyłączony");
    if (this.socket) throw new Error("Rozmowa głosowa jest już aktywna");
    this.callbacks.showAssistant();
    this.callbacks.setState("speaking");
    this.callbacks.onStatus?.("Generuję komunikat głosowy…");
    await nativeBridge.call("wakeWord.pause").catch(() => undefined);
    try {
      const pcm = await api.assistant.speechPcm(spoken);
      this.outputStarted = true;
      this.nativeOutputReady = false;
      await this.ensureOutputReady();
      for (const audio of this.pcmBase64Chunks(pcm)) await nativeBridge.call("assistantAudio.appendOutput", { audio });
      await this.finishOutput();
      this.callbacks.setState("success");
      this.callbacks.onStatus?.("Komunikat wypowiedziany");
      return { ok: true, spokenAt: new Date().toISOString() };
    } catch (error) {
      this.callbacks.setState("error");
      throw error;
    } finally {
      this.outputStarted = false;
      this.nativeOutputReady = false;
      await this.configureWake();
      this.callbacks.hideAssistant();
    }
  }

  async startLiveConversation(openingMessage: string, context = "") {
    if (!nativeBridge.available) throw new Error("Rozmowa jest dostępna tylko na tablecie WallDeck");
    if (!this.settings.enabled || !this.settings.voice.enabled || !this.settings.voice.live.conversationEnabled) throw new Error("Rozmowy GPT-Live są wyłączone");
    if (this.socket) throw new Error("Rozmowa głosowa jest już aktywna");
    const initial = `To zaplanowana rozmowa zainicjowana przez system. Rozpocznij naturalnie od wiadomości: „${openingMessage.trim()}”.${context.trim() ? ` Kontekst zadania: ${context.trim()}.` : ""} Po wiadomości otwierającej zaczekaj na odpowiedź użytkownika.`;
    await this.openConversation(initial, "gpt-live");
    return { ok: true, startedAt: new Date().toISOString() };
  }

  async dispose() {
    this.disposed = true;
    window.removeEventListener("wallpanel:wakeWordDetected", this.onWake as EventListener);
    window.removeEventListener("wallpanel:wakeWordCandidate", this.onWakeCandidate as EventListener);
    window.removeEventListener("wallpanel:assistantAudioChunk", this.onAudioChunk as EventListener);
    window.removeEventListener("wallpanel:speakerObserved", this.onSpeaker as EventListener);
    this.socket?.send(JSON.stringify({ type: "close" }));
    this.socket?.close();
    this.socket = null;
    if (this.livePrebufferTimer) clearTimeout(this.livePrebufferTimer);
    this.livePrebufferTimer = null;
    if (nativeBridge.available) {
      await Promise.allSettled([
        nativeBridge.call("assistantAudio.stopInput"),
        nativeBridge.call("assistantAudio.stopOutput"),
        nativeBridge.call("wakeWord.configure", { enabled: false, phrase: this.settings.voice.live.wakePhrase, confidenceThreshold: this.settings.voice.live.wakeConfidenceThreshold }),
      ]);
    }
  }

  private wakeEnabled() {
    const live = this.settings.voice.live;
    return nativeBridge.available && this.settings.enabled && this.settings.voice.enabled && live.conversationEnabled && live.wakeWordEnabled;
  }

  private async configureWake() {
    if (!nativeBridge.available) return;
    try {
      const status = await nativeBridge.call("wakeWord.configure", { enabled: this.wakeEnabled(), phrase: this.settings.voice.live.wakePhrase, confidenceThreshold: this.settings.voice.live.wakeConfidenceThreshold }) as { localAvailable?: boolean; permission?: boolean };
      if (this.wakeEnabled() && status.localAvailable === false) this.callbacks.onStatus?.("Brak lokalnego recognizera mowy na tablecie");
      else if (this.wakeEnabled() && status.permission === false) this.callbacks.onStatus?.("Czekam na zgodę na mikrofon");
    } catch (error) {
      this.callbacks.onStatus?.(error instanceof Error ? error.message : String(error));
    }
  }

  private onWake = (event: CustomEvent<WakeEvent>) => {
    if (!this.wakeEnabled() || this.socket) return;
    void this.openConversation(event.detail?.remainder?.trim() ?? "");
  };

  private onWakeCandidate = (event: CustomEvent<WakeCandidateEvent>) => {
    const { transcript, phrase, confidence, threshold, accepted, engine } = event.detail ?? {};
    if (typeof transcript !== "string" || typeof phrase !== "string" || typeof confidence !== "number" || typeof threshold !== "number" || typeof accepted !== "boolean") return;
    void api.diagnostics.wakeWord({ transcript, phrase, confidence, threshold, accepted, engine }).catch(() => undefined);
  };

  private onAudioChunk = (event: CustomEvent<AudioChunkEvent>) => {
    const audio = event.detail?.audio;
    if (!audio || !this.socket) return;
    if (this.socket.readyState === WebSocket.OPEN && this.sessionReady) {
      this.socket.send(JSON.stringify({ type: "audio", audio }));
      return;
    }
    // Keep the words spoken directly after the wake phrase while GPT-Live is connecting.
    this.pendingAudio.push(audio);
    if (this.pendingAudio.length > 50) this.pendingAudio.shift();
  };

  private onSpeaker = (event: CustomEvent<SpeakerEvent>) => {
    const { label, confidence, experimental } = event.detail ?? {};
    if (!this.settings.voice.live.speakerObservationEnabled || !label || typeof confidence !== "number") return;
    if (experimental !== true) return;
    void api.assistant.speakerObservation({ label, confidence, experimental: true }).catch(() => undefined);
  };

  private async openConversation(remainder: string, forcedMode?: "gpt-live") {
    const lunaPipeline = forcedMode ? false : this.settings.voice.conversationMode === "luna-pipeline";
    this.callbacks.showAssistant();
    this.callbacks.setState("attention");
    this.callbacks.onStatus?.(lunaPipeline ? "Uruchamiam Lunę…" : "Łączenie z GPT-Live…");
    if (!forcedMode) this.callbacks.playActivationSound?.();
    this.inputTranscript = "";
    this.lastTranscriptAt = 0;
    this.outputStarted = false;
    this.pendingAudio = [];
    this.sessionReady = false;
    this.pendingDelegations.clear();
    this.bufferedSpeechTask = null;
    this.nativeOutputReady = false;
    this.handledTranscriptLength = 0;
    this.liveAudioChunks = [];
    this.liveAudioBytes = 0;
    this.livePlaybackStarted = false;
    this.audioWriteChain = Promise.resolve();
    this.pendingUserTurn = false;
    void nativeBridge.call("haptics").catch(() => undefined);
    await nativeBridge.call("wakeWord.pause").catch(() => undefined);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams();
    if (!lunaPipeline && remainder.length >= 2) query.set("initial", remainder.slice(0, 1_800));
    if (forcedMode === "gpt-live") query.set("scheduled", "1");
    const initial = query.size ? `?${query.toString()}` : "";
    const route = lunaPipeline ? "/api/assistant/luna" : "/api/assistant/live";
    const socket = new WebSocket(`${protocol}//${location.host}${route}${initial}`);
    this.socket = socket;
    socket.addEventListener("message", (message) => { void this.handleMessage(JSON.parse(String(message.data)) as Record<string, unknown>); });
    socket.addEventListener("close", () => { void this.finish(); });
    socket.addEventListener("error", () => this.callbacks.onStatus?.(lunaPipeline ? "Błąd połączenia z Luną" : "Błąd połączenia GPT-Live"));
    await this.startInput();
  }

  private async handleMessage(message: Record<string, unknown>) {
    if (message.type === "ready") {
      this.sessionReady = true;
      this.callbacks.setState("listening");
      this.callbacks.onStatus?.("Słucham");
      await this.startInput();
      for (const audio of this.pendingAudio.splice(0)) {
        if (this.socket?.readyState !== WebSocket.OPEN) break;
        this.socket.send(JSON.stringify({ type: "audio", audio }));
      }
    } else if (message.type === "processing") {
      await this.stopInput();
      this.callbacks.setState("thinking");
      this.callbacks.onStatus?.("Rozpoznaję i wykonuję polecenie…");
    } else if (message.type === "answer") {
      this.callbacks.setState("thinking");
      this.callbacks.onStatus?.("Luna przygotowała odpowiedź");
    } else if (message.type === "working") {
      this.callbacks.setState("thinking");
      this.callbacks.onStatus?.(typeof message.status === "string" ? message.status : "Pracuję nad odpowiedzią…");
    } else if (message.type === "inputTranscript" && typeof message.delta === "string") {
      this.inputTranscript += message.delta;
      this.lastTranscriptAt = Date.now();
      this.pendingUserTurn = true;
        this.callbacks.setState("listening");
      this.callbacks.onStatus?.("Słucham");
    } else if (message.type === "inputTranscript" && typeof message.transcript === "string") {
      this.inputTranscript = message.transcript;
      this.callbacks.setState("thinking");
      this.callbacks.onStatus?.(`Usłyszałem: ${message.transcript}`);
    } else if (message.type === "outputTranscript") {
      this.callbacks.setState("speaking");
    } else if (message.type === "audio" && typeof message.audio === "string") {
      if (!this.outputStarted) {
        this.outputStarted = true;
      }
      if (this.pendingUserTurn) {
        this.handledTranscriptLength = this.inputTranscript.length;
        this.pendingUserTurn = false;
      }
      this.callbacks.setState("speaking");
      this.callbacks.onStatus?.("Mówię — możesz mi przerwać");
          this.queueLiveAudio(message.audio);
    } else if (message.type === "delegation" && typeof message.delegationId === "string") {
      if (this.bufferedSpeechTask) return;
          this.startDelegation(message.delegationId);
    } else if (message.type === "closed") {
      this.socket?.close();
    } else if (message.type === "error") {
      this.callbacks.setState("error");
      this.callbacks.onStatus?.(typeof message.error === "string" ? message.error : "Błąd GPT-Live");
      this.socket?.close();
    }
  }

  private startDelegation(delegationId: string | null, commandOverride?: string) {
    if (this.bufferedSpeechTask) return;
    const task = this.handleDelegation(delegationId, commandOverride);
    this.bufferedSpeechTask = task;
    void task.finally(() => {
      if (this.bufferedSpeechTask === task) this.bufferedSpeechTask = null;
    });
  }

  private async handleDelegation(delegationId: string | null, commandOverride?: string) {
    const delegationKey = delegationId ?? "transcript-fallback";
    if (this.pendingDelegations.has(delegationKey)) return;
    this.pendingDelegations.add(delegationKey);
    this.callbacks.setState("thinking");
    this.callbacks.onStatus?.("Pracuję nad odpowiedzią…");
    if (!commandOverride) await this.waitForTranscriptToSettle();
    const latestTurn = this.inputTranscript.slice(this.handledTranscriptLength).trim();
    const fullTranscript = this.inputTranscript.trim();
    const command = commandOverride?.trim()
      || (delegationId && fullTranscript ? delegatedCommandWithContext(fullTranscript) : latestTurn);
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!command) {
      socket.send(JSON.stringify({ type: "delegation.result", delegationId, content: "Nie otrzymano czytelnej treści polecenia. Poproś użytkownika krótko o powtórzenie." }));
      return;
    }
    let speechText: string;
    let trace: { model?: string; durationMs?: number; error?: string; toolCalls?: import("@walldeck/contracts").AiAssistantToolTrace[] } | undefined;
    try {
      const result = await api.assistant.run({ message: command, forceFallback: false, recordHistory: false });
      speechText = result.text;
      trace = {
        model: result.model,
        durationMs: result.durationMs,
        toolCalls: result.toolCalls.slice(0, 12).map(tool => ({
          name: tool.name,
          arguments: compactTraceValue(tool.arguments, 4_000),
          ...(tool.output !== undefined ? { output: compactTraceValue(tool.output, 8_000) } : {}),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      speechText = `Zadanie nie zostało wykonane: ${message}`;
      trace = { error: message };
    }
    this.handledTranscriptLength = this.inputTranscript.length;
    this.pendingUserTurn = false;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "delegation.result", delegationId, content: speechText, trace }));
      this.callbacks.onStatus?.("Backend odpowiedział");
    }
    this.pendingDelegations.delete(delegationKey);
  }

  private queueLiveAudio(audio: string) {
    const padding = audio.endsWith("==") ? 2 : audio.endsWith("=") ? 1 : 0;
    this.liveAudioChunks.push(audio);
    this.liveAudioBytes += Math.max(0, Math.floor(audio.length * 3 / 4) - padding);
    if (this.livePlaybackStarted || this.liveAudioBytes >= LIVE_PREBUFFER_BYTES) {
      void this.flushLiveAudio();
      return;
    }
    if (!this.livePrebufferTimer) {
      this.livePrebufferTimer = setTimeout(() => {
        this.livePrebufferTimer = null;
        void this.flushLiveAudio();
      }, LIVE_PREBUFFER_MS);
    }
  }

  private async flushLiveAudio() {
    if (this.livePrebufferTimer) clearTimeout(this.livePrebufferTimer);
    this.livePrebufferTimer = null;
    const chunks = this.liveAudioChunks.splice(0);
    this.liveAudioBytes = 0;
    if (!chunks.length) return;
    this.livePlaybackStarted = true;
    this.audioWriteChain = this.audioWriteChain.then(async () => {
      await this.ensureOutputReady();
      for (const audio of chunks) {
        for (const bridgeChunk of this.bridgeSizedAudioChunks(audio)) {
          await nativeBridge.call("assistantAudio.appendOutput", { audio: bridgeChunk });
        }
      }
    }).catch(error => {
      this.callbacks.onStatus?.(error instanceof Error ? error.message : String(error));
    });
    await this.audioWriteChain;
  }

  private bridgeSizedAudioChunks(audio: string) {
    if (audio.length <= 10_000) return [audio];
    const binary = atob(audio);
    const chunks: string[] = [];
    for (let offset = 0; offset < binary.length; offset += 8_192) {
      chunks.push(btoa(binary.slice(offset, offset + 8_192)));
    }
    return chunks;
  }

  private pcmBase64Chunks(pcm: Uint8Array) {
    const chunks: string[] = [];
    for (let offset = 0; offset < pcm.length; offset += 8_192) {
      let binary = "";
      for (const byte of pcm.subarray(offset, offset + 8_192)) binary += String.fromCharCode(byte);
      chunks.push(btoa(binary));
    }
    return chunks;
  }

  private async ensureOutputReady() {
    if (this.nativeOutputReady) return;
    await nativeBridge.call("assistantAudio.startOutput");
    this.nativeOutputReady = true;
  }

  private async finish() {
    if (!this.socket && this.disposed) return;
    this.socket = null;
    this.pendingAudio = [];
    this.sessionReady = false;
    if (this.livePrebufferTimer) clearTimeout(this.livePrebufferTimer);
    this.livePrebufferTimer = null;
    this.inputActive = false;
    await nativeBridge.call("assistantAudio.stopInput").catch(() => undefined);
    if (this.bufferedSpeechTask) await this.bufferedSpeechTask.catch(() => undefined);
    await this.flushLiveAudio();
    await this.audioWriteChain;
    await this.finishOutput();
    if (!this.disposed) {
      this.callbacks.setState("success");
      this.callbacks.onStatus?.("Rozmowa zakończona");
      await this.configureWake();
      this.callbacks.hideAssistant();
    }
  }

  private async startInput() {
    if (this.inputActive || !this.socket || this.socket.readyState === WebSocket.CLOSED) return;
    this.inputActive = true;
    try {
      // Speaker observation runs on the homelab over the same PCM stream. Keep the
      // legacy tablet heuristic disabled so it cannot overwrite the ECAPA result.
      await nativeBridge.call("assistantAudio.startInput", { speakerObservation: false });
    } catch (error) {
      this.inputActive = false;
      throw error;
    }
  }

  private async stopInput() {
    if (!this.inputActive) return;
    this.inputActive = false;
    await nativeBridge.call("assistantAudio.stopInput").catch(() => undefined);
  }

  private async waitForTranscriptToSettle() {
    const started = Date.now();
    while (Date.now() - started < 3_000) {
      const quietFor = this.lastTranscriptAt ? Date.now() - this.lastTranscriptAt : 0;
      if (this.inputTranscript.trim() && quietFor >= 700) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async finishOutput() {
    if (!this.outputStarted) {
      await nativeBridge.call("assistantAudio.stopOutput").catch(() => undefined);
      return;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let listener: EventListener | undefined;
    const drained = new Promise<void>(resolve => {
      listener = () => resolve();
      window.addEventListener("wallpanel:assistantOutputDrained", listener, { once: true });
      timeout = setTimeout(resolve, 20_000);
    });
    try {
      await nativeBridge.call("assistantAudio.finishOutput");
      await drained;
    } catch {
      await nativeBridge.call("assistantAudio.stopOutput").catch(() => undefined);
    } finally {
      this.nativeOutputReady = false;
      if (timeout) clearTimeout(timeout);
      if (listener) window.removeEventListener("wallpanel:assistantOutputDrained", listener);
    }
  }

}
