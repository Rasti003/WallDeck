import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";
import type { AiAssistantSettings, AiVoiceUsageStatus } from "@walldeck/contracts";

const LIVE_USD_PER_MINUTE = 0.05;
const PCM_RATE = 24_000;

type UsageFile = { months?: Record<string, { liveSeconds: number }> };

function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function wavFromPcm16(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = PCM_RATE * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(PCM_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function containsAudiblePcm(pcm: Buffer): boolean {
  if (pcm.length < 2) return false;
  let total = 0;
  let samples = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 32) {
    total += Math.abs(pcm.readInt16LE(offset));
    samples += 1;
  }
  return samples > 0 && total / samples >= 90;
}

export class LiveVoiceUsageStore {
  private readonly filePath: string;
  private writeQueue = Promise.resolve();

  constructor(runtimeRoot: string) {
    this.filePath = path.join(runtimeRoot, "assistant-voice-usage.json");
  }

  private async read(): Promise<UsageFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as UsageFile;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  async seconds(): Promise<number> {
    const data = await this.read();
    const value = data.months?.[monthKey()]?.liveSeconds;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  async add(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      const month = monthKey();
      const current = data.months?.[month]?.liveSeconds ?? 0;
      const next: UsageFile = { months: { ...(data.months ?? {}), [month]: { liveSeconds: current + seconds } } };
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await rename(temporary, this.filePath);
    });
    await this.writeQueue;
  }

  async status(settings: AiAssistantSettings): Promise<AiVoiceUsageStatus> {
    const liveSeconds = await this.seconds();
    const estimatedUsd = liveSeconds / 60 * LIVE_USD_PER_MINUTE;
    const budgetUsd = settings.voice.live.monthlyBudgetUsd;
    const exhausted = estimatedUsd >= budgetUsd;
    return {
      month: monthKey(),
      liveSeconds: Math.round(liveSeconds * 10) / 10,
      estimatedUsd: Math.round(estimatedUsd * 1000) / 1000,
      budgetUsd,
      remainingUsd: Math.round(Math.max(0, budgetUsd - estimatedUsd) * 1000) / 1000,
      exhausted,
      fallbackActive: settings.voice.enabled && settings.voice.provider === "openai-live" && exhausted && settings.voice.live.fallbackToTts,
    };
  }
}

export type LiveSpeechResult = { audio: Buffer; usageSeconds: number; transcript: string };

export async function renderLiveSpeech(
  apiKey: string,
  text: string,
  settings: AiAssistantSettings["voice"],
  recordUsage?: (seconds: number) => Promise<void>,
): Promise<LiveSpeechResult> {
  const client = new OpenAI({ apiKey });
  const connection = new LiveWS(client, { reconnect: null });
  const audioChunks: Buffer[] = [];
  let transcript = "";
  let usageSeconds = 0;
  let startedAt = Date.now();
  let sessionStarted = false;
  let closeRequested = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setInterval> | undefined;
  const silenceFrame = Buffer.alloc(PCM_RATE / 10 * 2).toString("base64");

  const requestClose = () => {
    if (closeRequested) return;
    closeRequested = true;
    connection.send({ type: "session.close", event_id: `close_${Date.now()}` });
    forceTimer = setTimeout(() => connection.close({ code: 1000, reason: "WallDeck close timeout" }), 5_000);
  };

  try {
    for await (const envelope of connection) {
      if (envelope.type === "open") {
        startedAt = Date.now();
        hardTimer = setTimeout(requestClose, settings.live.hardLimitSeconds * 1_000);
        connection.send({
          type: "session.start",
          event_id: `start_${Date.now()}`,
          session: {
            model: settings.live.model,
            store: false,
            instructions: `${settings.instructions} Mów wyłącznie po polsku. Przekaż zwięźle treść otrzymaną od aplikacji i nie dodawaj nowych informacji.`,
            audio: { format: { type: "audio/pcm", rate: PCM_RATE }, output: { voice: settings.live.voice } },
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
        connection.send({ type: "session.input_audio.append", event_id: `silence_${Date.now()}`, audio: silenceFrame });
        silenceTimer = setInterval(() => {
          if (!closeRequested) connection.send({ type: "session.input_audio.append", event_id: `silence_${Date.now()}`, audio: silenceFrame });
        }, 100);
        connection.send({
          type: "session.instructions.append",
          event_id: `speak_${Date.now()}`,
          delegation_id: null,
          content: `Powiedz teraz po polsku dokładnie tę wiadomość i zacznij natychmiast. Po jej wypowiedzeniu zamilknij: ${text}`,
        });
      } else if (event.type === "session.output_audio.delta") {
        const chunk = Buffer.from(event.delta, "base64");
        audioChunks.push(chunk);
        if (containsAudiblePcm(chunk)) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(requestClose, Math.max(10_000, settings.live.idleCloseMs));
        }
      } else if (event.type === "session.output_transcript.delta") {
        transcript += event.delta;
      } else if (event.type === "session.usage.updated") {
        usageSeconds = Math.max(usageSeconds, event.usage.seconds);
      } else if (event.type === "session.closed") {
        usageSeconds = Math.max(usageSeconds, event.usage?.seconds ?? 0);
        break;
      } else if (event.type === "error") {
        throw new Error(event.error?.message ?? "GPT-Live zwrócił błąd");
      }
    }
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    if (hardTimer) clearTimeout(hardTimer);
    if (forceTimer) clearTimeout(forceTimer);
    if (silenceTimer) clearInterval(silenceTimer);
    connection.close({ code: 1000, reason: "WallDeck finished" });
    if (sessionStarted) {
      usageSeconds = usageSeconds || Math.max(0, (Date.now() - startedAt) / 1_000);
      await recordUsage?.(usageSeconds);
    }
  }

  const pcm = Buffer.concat(audioChunks);
  if (!pcm.length) throw new Error("GPT-Live nie zwrócił dźwięku");
  return { audio: wavFromPcm16(pcm), usageSeconds, transcript: transcript.trim() };
}
