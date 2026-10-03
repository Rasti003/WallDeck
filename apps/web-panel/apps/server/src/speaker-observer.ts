import { createHash } from "node:crypto";
import type { SpeakerObservation } from "@walldeck/contracts";

const DEFAULT_WINDOW_BYTES = 24_000 * 2 * 3;
const MIN_FINAL_BYTES = 24_000 * 2;
const MAX_BUFFER_BYTES = 24_000 * 2 * 8;
const SAME_SPEAKER_THRESHOLD = 0.72;

export type SpeakerAnalysis = {
  speech: boolean;
  speechSeconds: number;
  lastSpeechEndSeconds?: number | null;
  processingMs: number;
  embedding?: number[];
};

export type SpeakerObserverHealth = {
  available: boolean;
  engine: "silero-ecapa";
  modelReady: boolean;
  detail?: string;
};

export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator > 0 ? dot / denominator : 0;
}

export function speakerFingerprintId(embedding: number[]): string {
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value ** 2, 0));
  if (!embedding.length || !Number.isFinite(norm) || norm <= 0) return "spk_unavailable";
  const quantized = Buffer.from(embedding.map(value => Math.max(0, Math.min(255, Math.round(value / norm * 64) + 128))));
  return `spk_${createHash("sha256").update(quantized).digest("hex").slice(0, 16)}`;
}

export class SpeakerObserverClient {
  private cachedHealth: { expiresAt: number; value: SpeakerObserverHealth } | null = null;

  constructor(
    private readonly baseUrl = process.env.SPEAKER_SERVICE_URL ?? "http://speaker-service:8091",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<SpeakerObserverHealth> {
    if (this.cachedHealth && this.cachedHealth.expiresAt > Date.now()) return this.cachedHealth.value;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { engine?: unknown; modelReady?: unknown };
      const value: SpeakerObserverHealth = { available: true, engine: "silero-ecapa", modelReady: body.modelReady === true };
      this.cachedHealth = { expiresAt: Date.now() + 10_000, value };
      return value;
    } catch (error) {
      const value: SpeakerObserverHealth = { available: false, engine: "silero-ecapa", modelReady: false, detail: error instanceof Error ? error.message : String(error) };
      this.cachedHealth = { expiresAt: Date.now() + 3_000, value };
      return value;
    }
  }

  async analyze(pcm: Buffer, sampleRate = 24_000): Promise<SpeakerAnalysis> {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/analyze`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-sample-rate": String(sampleRate) },
      body: new Uint8Array(pcm),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Speaker service zwrócił HTTP ${response.status}`);
    const body = await response.json() as SpeakerAnalysis;
    if (typeof body.speech !== "boolean" || typeof body.speechSeconds !== "number" || typeof body.processingMs !== "number") {
      throw new Error("Speaker service zwrócił nieprawidłową odpowiedź");
    }
    if (body.embedding && (!Array.isArray(body.embedding) || body.embedding.some(value => typeof value !== "number" || !Number.isFinite(value)))) {
      throw new Error("Speaker service zwrócił nieprawidłowy embedding");
    }
    return body;
  }

  session(onObservation: (observation: SpeakerObservation) => void, onError?: (error: Error) => void) {
    return new SpeakerObservationSession(this, onObservation, onError);
  }
}

export class SpeakerObservationSession {
  private chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private anchor: number[] | null = null;
  private anchorFingerprintId: string | null = null;
  private chain = Promise.resolve();
  private closed = false;

  constructor(
    private readonly client: Pick<SpeakerObserverClient, "analyze">,
    private readonly onObservation: (observation: SpeakerObservation) => void,
    private readonly onError: (error: Error) => void = () => undefined,
  ) {}

  append(pcm: Buffer) {
    if (this.closed || !pcm.length || pcm.length % 2 !== 0) return;
    this.chunks.push(pcm);
    this.bufferedBytes += pcm.length;
    if (this.bufferedBytes > MAX_BUFFER_BYTES) this.trimTo(MAX_BUFFER_BYTES);
    if (this.bufferedBytes >= DEFAULT_WINDOW_BYTES) this.queueWindow(DEFAULT_WINDOW_BYTES);
  }

  async finish() {
    this.closed = true;
    if (this.bufferedBytes >= MIN_FINAL_BYTES) this.queueWindow(this.bufferedBytes);
    else this.clear();
    await this.chain;
  }

  private queueWindow(byteCount: number) {
    const pcm = this.consume(byteCount);
    this.chain = this.chain.then(async () => {
      try {
        const result = await this.client.analyze(pcm);
        if (!result.speech || !result.embedding?.length) return;
        if (!this.anchor) {
          this.anchor = result.embedding;
          this.anchorFingerprintId = speakerFingerprintId(result.embedding);
          this.onObservation({
            label: "Aktywny mówca",
            confidence: 1,
            observedAt: new Date().toISOString(),
            experimental: true,
            engine: "silero-ecapa",
            relation: "anchor",
            speechSeconds: result.speechSeconds,
            processingMs: result.processingMs,
            fingerprintId: this.anchorFingerprintId,
            anchorFingerprintId: this.anchorFingerprintId,
          });
          return;
        }
        const similarity = cosineSimilarity(this.anchor, result.embedding);
        const same = similarity >= SAME_SPEAKER_THRESHOLD;
        const candidateFingerprintId = speakerFingerprintId(result.embedding);
        this.onObservation({
          label: same ? "Aktywny mówca" : "Inny głos",
          confidence: same ? similarity : 1 - similarity,
          observedAt: new Date().toISOString(),
          experimental: true,
          engine: "silero-ecapa",
          relation: same ? "same" : "different",
          similarity,
          speechSeconds: result.speechSeconds,
          processingMs: result.processingMs,
          fingerprintId: same ? this.anchorFingerprintId ?? candidateFingerprintId : candidateFingerprintId,
          anchorFingerprintId: this.anchorFingerprintId ?? undefined,
        });
      } catch (error) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private consume(byteCount: number): Buffer {
    const all = Buffer.concat(this.chunks, this.bufferedBytes);
    const taken = all.subarray(0, byteCount);
    const remaining = all.subarray(byteCount);
    this.chunks = remaining.length ? [remaining] : [];
    this.bufferedBytes = remaining.length;
    return taken;
  }

  private trimTo(byteCount: number) {
    const all = Buffer.concat(this.chunks, this.bufferedBytes);
    const kept = all.subarray(Math.max(0, all.length - byteCount));
    this.chunks = kept.length ? [kept] : [];
    this.bufferedBytes = kept.length;
  }

  private clear() {
    this.chunks = [];
    this.bufferedBytes = 0;
  }
}
