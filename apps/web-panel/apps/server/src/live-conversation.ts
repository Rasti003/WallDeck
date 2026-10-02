import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";
import type { FastifyInstance } from "fastify";
import type { AiAssistantSettings } from "@walldeck/contracts";
import type { LiveVoiceUsageStore } from "./live-voice.js";

type Dependencies = {
  getApiKey(): Promise<string | null>;
  getSettings(): Promise<AiAssistantSettings>;
  usage: LiveVoiceUsageStore;
};

type ClientMessage =
  | { type: "audio"; audio: string }
  | { type: "delegation.result"; delegationId: string | null; content: string }
  | { type: "context"; content: string }
  | { type: "close" };

const PCM_RATE = 24_000;

export function registerLiveConversation(app: FastifyInstance, deps: Dependencies) {
  let active = false;
  app.get("/api/assistant/live", { websocket: true }, async (socket, request) => {
    const origin = request.headers.origin;
    if (!origin || !request.headers.host || new URL(origin).host !== request.headers.host) {
      socket.send(JSON.stringify({ type: "error", error: "Nieprawidłowy origin rozmowy" }));
      socket.close();
      return;
    }
    if (active) {
      socket.send(JSON.stringify({ type: "error", error: "Inna rozmowa głosowa jest już aktywna" }));
      socket.close();
      return;
    }
    const settings = await deps.getSettings();
    const key = await deps.getApiKey();
    const usage = await deps.usage.status(settings);
    if (!settings.enabled || !settings.voice.enabled || settings.voice.provider !== "openai-live" || !settings.voice.live.conversationEnabled) {
      socket.send(JSON.stringify({ type: "error", error: "Rozmowy GPT-Live są wyłączone" }));
      socket.close();
      return;
    }
    if (!key || usage.exhausted) {
      socket.send(JSON.stringify({ type: "error", error: key ? "Miesięczny limit GPT-Live został osiągnięty" : "Brak klucza OpenAI API" }));
      socket.close();
      return;
    }

    active = true;
    const client = new OpenAI({ apiKey: key });
    const live = new LiveWS(client, { reconnect: null });
    let startedAt = Date.now();
    let sessionStarted = false;
    let closeRequested = false;
    let finalUsage = 0;
    const pendingAudio: string[] = [];
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;

    const send = (message: unknown) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message));
    };
    const requestClose = () => {
      if (closeRequested) return;
      closeRequested = true;
      if (sessionStarted) live.send({ type: "session.close", event_id: `close_${Date.now()}` });
      else live.close({ code: 1000, reason: "WallDeck closed before start" });
    };
    const postponeIdleClose = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(requestClose, Math.max(5_000, settings.voice.live.idleCloseMs));
    };

    socket.on("message", (raw: Buffer) => {
      if (raw.length > 180_000) return;
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        if (message.type === "audio" && typeof message.audio === "string" && message.audio.length <= 160_000 && !closeRequested) {
          if (idleTimer) clearTimeout(idleTimer);
          if (sessionStarted) {
            live.send({ type: "session.input_audio.append", event_id: `audio_${Date.now()}`, audio: message.audio });
          } else {
            pendingAudio.push(message.audio);
            if (pendingAudio.length > 50) pendingAudio.shift();
          }
        } else if (message.type === "delegation.result" && typeof message.content === "string" && message.content.length <= 4_000 && !closeRequested) {
          live.send({ type: "session.commentary.append", event_id: `result_${Date.now()}`, delegation_id: message.delegationId, content: message.content });
        } else if (message.type === "context" && typeof message.content === "string" && message.content.length <= 2_000 && !closeRequested) {
          live.send({ type: "session.thinking.append", event_id: `context_${Date.now()}`, delegation_id: null, content: message.content });
        } else if (message.type === "close") requestClose();
      } catch { /* Ignore malformed audio transport messages. */ }
    });
    socket.on("close", requestClose);

    try {
      for await (const envelope of live) {
        if (envelope.type === "open") {
          startedAt = Date.now();
          hardTimer = setTimeout(requestClose, settings.voice.live.hardLimitSeconds * 1_000);
          live.send({
            type: "session.start",
            event_id: `start_${Date.now()}`,
            session: {
              model: settings.voice.live.model,
              store: false,
              instructions: `${settings.voice.instructions} Rozmawiaj wyłącznie po polsku. Jesteś głosem domowego asystenta WallDeck. Odpowiadaj krótko. Zlecaj do klienta każde polecenie wymagające narzędzia, aktualnych danych, pamięci albo działania w domu. Nie ogłaszaj wykonania działania przed otrzymaniem wyniku delegacji.`,
              audio: { format: { type: "audio/pcm", rate: PCM_RATE }, output: { voice: settings.voice.live.voice } },
              delegation: { type: "client" },
            },
          });
          continue;
        }
        if (envelope.type === "error") throw envelope.error;
        if (envelope.type !== "message") continue;
        const event = envelope.message;
        if (event.type === "session.started") {
          sessionStarted = true;
          pendingAudio.splice(0).forEach((audio, index) => {
            live.send({ type: "session.input_audio.append", event_id: `buffered_${Date.now()}_${index}`, audio });
          });
          send({ type: "ready", sessionId: event.session.id, sampleRate: PCM_RATE });
        } else if (event.type === "session.input_transcript.delta") {
          if (idleTimer) clearTimeout(idleTimer);
          send({ type: "inputTranscript", delta: event.delta, startMs: event.start_ms, endMs: event.end_ms });
        } else if (event.type === "session.output_transcript.delta") {
          send({ type: "outputTranscript", delta: event.delta, startMs: event.start_ms, endMs: event.end_ms });
        } else if (event.type === "session.output_audio.delta") {
          send({ type: "audio", audio: event.delta });
          postponeIdleClose();
        } else if (event.type === "session.delegation.created") {
          send({ type: "delegation", delegationId: event.delegation.id, offsetMs: event.offset_ms });
        } else if (event.type === "session.usage.updated") {
          finalUsage = Math.max(finalUsage, event.usage.seconds);
          send({ type: "usage", seconds: finalUsage });
        } else if (event.type === "session.closed") {
          finalUsage = Math.max(finalUsage, event.usage?.seconds ?? 0);
          send({ type: "closed", seconds: finalUsage });
          break;
        } else if (event.type === "error") {
          throw new Error(event.error?.message ?? "GPT-Live zwrócił błąd");
        }
      }
    } catch (error) {
      app.log.error({ err: error }, "GPT-Live conversation failed");
      send({ type: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      live.close({ code: 1000, reason: "WallDeck conversation finished" });
      if (sessionStarted) {
        finalUsage = finalUsage || Math.max(0, (Date.now() - startedAt) / 1_000);
        await deps.usage.add(finalUsage);
      }
      active = false;
      if (socket.readyState === 1) socket.close();
    }
  });
}
