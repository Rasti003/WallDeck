import type { FastifyInstance } from "fastify";
import OpenAI, { toFile } from "openai";
import type { AiAssistantRunResult, AiAssistantSettings, SpeakerObservation } from "@walldeck/contracts";
import type { AssistantService } from "./assistant.js";
import { cosineSimilarity, type SpeakerObserverClient } from "./speaker-observer.js";
import { wavFromPcm16 } from "./live-voice.js";

type Dependencies = {
  getApiKey(): Promise<string | null>;
  getSettings(): Promise<AiAssistantSettings>;
  assistant: Pick<AssistantService, "execute">;
  speakerObserver: SpeakerObserverClient;
  onSpeakerObservation(observation: SpeakerObservation): void;
  renderSpeechPcm(apiKey: string, text: string, settings: AiAssistantSettings): Promise<Buffer>;
};

type ClientMessage = { type: "audio"; audio: string } | { type: "close" };

const PCM_RATE = 24_000;
const BYTES_PER_SECOND = PCM_RATE * 2;
const ANALYSIS_WINDOW_BYTES = BYTES_PER_SECOND * 3;
const ANALYSIS_INTERVAL_MS = 750;
const SAME_SPEAKER_THRESHOLD = 0.72;

function audible(pcm: Buffer) {
  if (pcm.length < 2) return false;
  let total = 0;
  let count = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 32) {
    total += Math.abs(pcm.readInt16LE(offset));
    count += 1;
  }
  return count > 0 && total / count >= 90;
}

export function shouldEndSpeakerTurn(input: {
  anchorReady: boolean;
  elapsedSinceMatchingMs: number;
  endOfTurnMs: number;
  recentSpeech: boolean;
  currentSpeakerMatches: boolean;
}) {
  return input.anchorReady
    && input.elapsedSinceMatchingMs >= input.endOfTurnMs
    && (!input.recentSpeech || !input.currentSpeakerMatches);
}

export function registerLunaConversation(app: FastifyInstance, deps: Dependencies) {
  let active = false;

  app.get("/api/assistant/luna", { websocket: true }, async (socket, request) => {
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
    const apiKey = await deps.getApiKey();
    if (!settings.enabled || !settings.voice.enabled || settings.voice.conversationMode !== "luna-pipeline" || !settings.voice.live.conversationEnabled) {
      socket.send(JSON.stringify({ type: "error", error: "Tryb Luna jest wyłączony" }));
      socket.close();
      return;
    }
    if (!apiKey) {
      socket.send(JSON.stringify({ type: "error", error: "Brak klucza OpenAI API" }));
      socket.close();
      return;
    }
    const openAiApiKey = apiKey;

    active = true;
    const chunks: Buffer[] = [];
    let bytes = 0;
    let finished = false;
    let processing = false;
    let anchor: number[] | null = null;
    let currentSpeakerMatches = true;
    let lastMatchingSpeakerAt = 0;
    let lastAudibleAt = 0;
    let analysisRunning = false;
    const startedAt = Date.now();
    const maxTimer = setTimeout(() => void finishTurn("maximum-duration"), settings.voice.pipeline.maxInputSeconds * 1_000);
    const analysisTimer = setInterval(() => void analyzeRecentAudio(), ANALYSIS_INTERVAL_MS);

    const send = (message: unknown) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message));
    };

    async function analyzeRecentAudio() {
      if (finished || processing || analysisRunning || bytes < BYTES_PER_SECOND) return;
      if (!settings.voice.live.speakerObservationEnabled) {
        if (lastAudibleAt && Date.now() - lastAudibleAt >= settings.voice.pipeline.endOfTurnMs) void finishTurn("audio-fallback-ended");
        return;
      }
      analysisRunning = true;
      try {
        const all = Buffer.concat(chunks, bytes);
        const window = all.subarray(Math.max(0, all.length - ANALYSIS_WINDOW_BYTES));
        const result = await deps.speakerObserver.analyze(window, PCM_RATE);
        const windowSeconds = window.length / BYTES_PER_SECOND;
        const recentSpeech = result.speech && typeof result.lastSpeechEndSeconds === "number"
          && windowSeconds - result.lastSpeechEndSeconds < settings.voice.pipeline.endOfTurnMs / 1_000;

        if (result.speech && result.embedding?.length) {
          if (!anchor) {
            anchor = result.embedding;
            currentSpeakerMatches = true;
            lastMatchingSpeakerAt = Date.now();
            deps.onSpeakerObservation({
              label: "Aktywny mówca", confidence: 1, observedAt: new Date().toISOString(), experimental: true,
              engine: "silero-ecapa", relation: "anchor", speechSeconds: result.speechSeconds, processingMs: result.processingMs,
            });
          } else {
            const similarity = cosineSimilarity(anchor, result.embedding);
            const same = similarity >= SAME_SPEAKER_THRESHOLD;
            currentSpeakerMatches = same;
            if (same && recentSpeech) lastMatchingSpeakerAt = Date.now();
            deps.onSpeakerObservation({
              label: same ? "Aktywny mówca" : "Inny głos", confidence: same ? similarity : 1 - similarity,
              observedAt: new Date().toISOString(), experimental: true, engine: "silero-ecapa",
              relation: same ? "same" : "different", similarity, speechSeconds: result.speechSeconds, processingMs: result.processingMs,
            });
          }
        }

        if (shouldEndSpeakerTurn({
          anchorReady: Boolean(anchor),
          elapsedSinceMatchingMs: Date.now() - lastMatchingSpeakerAt,
          endOfTurnMs: settings.voice.pipeline.endOfTurnMs,
          recentSpeech,
          currentSpeakerMatches,
        })) {
          void finishTurn("speaker-ended");
        }
      } catch (error) {
        app.log.warn({ err: error }, "Luna speaker turn detection unavailable");
        if (bytes >= BYTES_PER_SECOND && lastAudibleAt && Date.now() - lastAudibleAt >= settings.voice.pipeline.endOfTurnMs) {
          void finishTurn("audio-fallback-ended");
        }
      } finally {
        analysisRunning = false;
      }
    }

    async function finishTurn(reason: string) {
      if (finished || processing) return;
      finished = true;
      processing = true;
      clearInterval(analysisTimer);
      clearTimeout(maxTimer);
      send({ type: "processing", reason });
      try {
        const pcm = Buffer.concat(chunks, bytes);
        if (pcm.length < BYTES_PER_SECOND / 2) throw new Error("Nie usłyszałem pełnego polecenia");
        const client = new OpenAI({ apiKey: openAiApiKey });
        const transcription = await client.audio.transcriptions.create({
          file: await toFile(wavFromPcm16(pcm), "waldeck-command.wav", { type: "audio/wav" }),
          model: settings.voice.pipeline.transcriptionModel,
          language: "pl",
          prompt: "Polecenie do domowego asystenta Waldek. Nazwy: WallDeck, Spotify, Home Assistant.",
        });
        const transcript = transcription.text.trim();
        if (!transcript) throw new Error("Nie udało się rozpoznać polecenia");
        send({ type: "inputTranscript", transcript });
        const result: AiAssistantRunResult = await deps.assistant.execute(transcript, settings, false);
        send({ type: "answer", text: result.text, model: result.model, toolCalls: result.toolCalls.length });
        const speech = await deps.renderSpeechPcm(openAiApiKey, result.text, settings);
        const chunkBytes = 8_192;
        for (let offset = 0; offset < speech.length; offset += chunkBytes) {
          send({ type: "audio", audio: speech.subarray(offset, offset + chunkBytes).toString("base64") });
        }
        send({ type: "closed", reason: "completed" });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : String(error) });
      } finally {
        app.log.info({ reason, durationMs: Date.now() - startedAt, inputBytes: bytes }, "Luna voice turn completed");
        active = false;
        if (socket.readyState === 1) socket.close();
      }
    }

    socket.on("message", (raw: Buffer) => {
      if (raw.length > 180_000 || finished) return;
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        if (message.type === "audio" && typeof message.audio === "string" && message.audio.length <= 160_000) {
          const pcm = Buffer.from(message.audio, "base64");
          if (!pcm.length || pcm.length % 2 !== 0) return;
          chunks.push(pcm);
          bytes += pcm.length;
          if (audible(pcm)) lastAudibleAt = Date.now();
        } else if (message.type === "close") {
          void finishTurn("client-requested");
        }
      } catch { /* Ignore malformed transport messages. */ }
    });
    socket.on("close", () => {
      if (!finished) {
        finished = true;
        clearInterval(analysisTimer);
        clearTimeout(maxTimer);
        active = false;
      }
    });
    send({ type: "ready", sampleRate: PCM_RATE, mode: "luna-pipeline" });
  });
}
