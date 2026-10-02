import type { AiAssistantSettings, AssistantState } from "@walldeck/contracts";
import { api } from "./api";
import { nativeBridge } from "./native";

type Callbacks = {
  setState(state: AssistantState): void;
  showAssistant(): void;
  onStatus?(status: string): void;
};

type WakeEvent = { transcript?: string; remainder?: string };
type AudioChunkEvent = { audio?: string };
type SpeakerEvent = { label?: string; confidence?: number; experimental?: boolean };

export class VoiceAssistantRuntime {
  private socket: WebSocket | null = null;
  private inputTranscript = "";
  private outputStarted = false;
  private disposed = false;
  private pendingDelegations = new Set<string>();

  constructor(private settings: AiAssistantSettings, private callbacks: Callbacks) {}

  async start() {
    window.addEventListener("wallpanel:wakeWordDetected", this.onWake as EventListener);
    window.addEventListener("wallpanel:assistantAudioChunk", this.onAudioChunk as EventListener);
    window.addEventListener("wallpanel:speakerObserved", this.onSpeaker as EventListener);
    await this.configureWake();
  }

  async dispose() {
    this.disposed = true;
    window.removeEventListener("wallpanel:wakeWordDetected", this.onWake as EventListener);
    window.removeEventListener("wallpanel:assistantAudioChunk", this.onAudioChunk as EventListener);
    window.removeEventListener("wallpanel:speakerObserved", this.onSpeaker as EventListener);
    this.socket?.send(JSON.stringify({ type: "close" }));
    this.socket?.close();
    this.socket = null;
    if (nativeBridge.available) {
      await Promise.allSettled([
        nativeBridge.call("assistantAudio.stopInput"),
        nativeBridge.call("assistantAudio.stopOutput"),
        nativeBridge.call("wakeWord.configure", { enabled: false, phrase: this.settings.voice.live.wakePhrase }),
      ]);
    }
  }

  private wakeEnabled() {
    const live = this.settings.voice.live;
    return nativeBridge.available && this.settings.enabled && this.settings.voice.enabled && this.settings.voice.provider === "openai-live" && live.conversationEnabled && live.wakeWordEnabled;
  }

  private async configureWake() {
    if (!nativeBridge.available) return;
    try {
      const status = await nativeBridge.call("wakeWord.configure", { enabled: this.wakeEnabled(), phrase: this.settings.voice.live.wakePhrase }) as { localAvailable?: boolean; permission?: boolean };
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

  private onAudioChunk = (event: CustomEvent<AudioChunkEvent>) => {
    const audio = event.detail?.audio;
    if (audio && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "audio", audio }));
  };

  private onSpeaker = (event: CustomEvent<SpeakerEvent>) => {
    const { label, confidence, experimental } = event.detail ?? {};
    if (!this.settings.voice.live.speakerObservationEnabled || !label || typeof confidence !== "number") return;
    if (experimental !== true) return;
    void api.assistant.speakerObservation({ label, confidence, experimental: true }).catch(() => undefined);
  };

  private async openConversation(remainder: string) {
    this.callbacks.showAssistant();
    this.callbacks.setState("attention");
    this.callbacks.onStatus?.("Łączenie z GPT-Live…");
    this.inputTranscript = "";
    this.outputStarted = false;
    this.pendingDelegations.clear();
    await nativeBridge.call("wakeWord.pause").catch(() => undefined);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/assistant/live`);
    this.socket = socket;
    socket.addEventListener("message", (message) => { void this.handleMessage(JSON.parse(String(message.data)) as Record<string, unknown>, remainder); });
    socket.addEventListener("close", () => { void this.finish(); });
    socket.addEventListener("error", () => this.callbacks.onStatus?.("Błąd połączenia GPT-Live"));
  }

  private async handleMessage(message: Record<string, unknown>, remainder: string) {
    if (message.type === "ready") {
      this.callbacks.setState("listening");
      this.callbacks.onStatus?.("Słucham");
      await nativeBridge.call("assistantAudio.startOutput").catch(() => undefined);
      await nativeBridge.call("assistantAudio.startInput", { speakerObservation: this.settings.voice.live.speakerObservationEnabled });
      if (remainder.length >= 2) void this.executePreservedCommand(remainder);
    } else if (message.type === "inputTranscript" && typeof message.delta === "string") {
      this.inputTranscript += message.delta;
      this.callbacks.setState("listening");
    } else if (message.type === "outputTranscript") {
      this.callbacks.setState("speaking");
    } else if (message.type === "audio" && typeof message.audio === "string") {
      if (!this.outputStarted) { this.outputStarted = true; this.callbacks.setState("speaking"); }
      await nativeBridge.call("assistantAudio.appendOutput", { audio: message.audio }).catch(() => undefined);
    } else if (message.type === "delegation" && typeof message.delegationId === "string") {
      void this.handleDelegation(message.delegationId);
    } else if (message.type === "closed") {
      this.socket?.close();
    } else if (message.type === "error") {
      this.callbacks.setState("error");
      this.callbacks.onStatus?.(typeof message.error === "string" ? message.error : "Błąd GPT-Live");
      this.socket?.close();
    }
  }

  private async executePreservedCommand(command: string) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    this.callbacks.setState("thinking");
    socket.send(JSON.stringify({ type: "context", content: `Użytkownik powiedział po wake wordzie: ${command}` }));
    try {
      const result = await api.assistant.run({ message: command, forceFallback: false });
      socket.send(JSON.stringify({ type: "delegation.result", delegationId: null, content: result.text }));
    } catch (error) {
      socket.send(JSON.stringify({ type: "delegation.result", delegationId: null, content: `Nie udało się wykonać polecenia: ${error instanceof Error ? error.message : String(error)}` }));
    }
  }

  private async handleDelegation(delegationId: string) {
    if (this.pendingDelegations.has(delegationId)) return;
    this.pendingDelegations.add(delegationId);
    this.callbacks.setState("thinking");
    await new Promise(resolve => setTimeout(resolve, 250));
    const command = this.inputTranscript.trim();
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!command) {
      socket.send(JSON.stringify({ type: "delegation.result", delegationId, content: "Nie otrzymano czytelnej treści polecenia. Poproś użytkownika krótko o powtórzenie." }));
      return;
    }
    try {
      const result = await api.assistant.run({ message: command, forceFallback: false });
      socket.send(JSON.stringify({ type: "delegation.result", delegationId, content: result.text }));
    } catch (error) {
      socket.send(JSON.stringify({ type: "delegation.result", delegationId, content: `Zadanie nie zostało wykonane: ${error instanceof Error ? error.message : String(error)}` }));
    }
  }

  private async finish() {
    if (!this.socket && this.disposed) return;
    this.socket = null;
    await Promise.allSettled([
      nativeBridge.call("assistantAudio.stopInput"),
      nativeBridge.call("assistantAudio.stopOutput"),
    ]);
    if (!this.disposed) {
      this.callbacks.setState("success");
      this.callbacks.onStatus?.("Rozmowa zakończona");
      await nativeBridge.call("wakeWord.resume").catch(() => undefined);
    }
  }
}
