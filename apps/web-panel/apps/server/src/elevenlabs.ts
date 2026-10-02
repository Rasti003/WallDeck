import type { AiAssistantSettings, ElevenLabsVoice } from "@walldeck/contracts";

type ElevenLabsConfig = AiAssistantSettings["voice"]["elevenLabs"];
type OutputFormat = "mp3_44100_128" | "pcm_24000";

function errorMessage(body: unknown, status: number) {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail && typeof (detail as { message?: unknown }).message === "string") {
      return (detail as { message: string }).message;
    }
  }
  return `ElevenLabs zwróciło HTTP ${status}`;
}

export async function renderElevenLabsSpeech(
  apiKey: string,
  text: string,
  config: ElevenLabsConfig,
  outputFormat: OutputFormat,
  fetchImpl: typeof fetch = fetch,
) {
  const voiceId = config.voiceId.trim();
  if (!voiceId) throw new Error("Wybierz głos ElevenLabs");
  const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${outputFormat}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: outputFormat.startsWith("pcm_") ? "audio/pcm" : "audio/mpeg" },
    body: JSON.stringify({ text, model_id: config.model }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), response.status));
  return Buffer.from(await response.arrayBuffer());
}

export async function listElevenLabsVoices(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ElevenLabsVoice[]> {
  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.search = new URLSearchParams({ page_size: "100", include_total_count: "false", sort: "name", sort_direction: "asc" }).toString();
  const response = await fetchImpl(url, {
    headers: { "xi-api-key": apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), response.status));
  const body = await response.json() as { voices?: unknown };
  if (!Array.isArray(body.voices)) throw new Error("ElevenLabs zwróciło nieprawidłową listę głosów");
  return body.voices.flatMap((item): ElevenLabsVoice[] => {
    if (!item || typeof item !== "object") return [];
    const voice = item as Record<string, unknown>;
    if (typeof voice.voice_id !== "string" || typeof voice.name !== "string") return [];
    const labels = voice.labels && typeof voice.labels === "object" && !Array.isArray(voice.labels)
      ? Object.fromEntries(Object.entries(voice.labels).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
    const verifiedLanguages = Array.isArray(voice.verified_languages)
      ? voice.verified_languages.flatMap(value => value && typeof value === "object" && typeof (value as { language?: unknown }).language === "string" ? [(value as { language: string }).language] : [])
      : [];
    return [{ voiceId: voice.voice_id, name: voice.name, category: typeof voice.category === "string" ? voice.category : undefined, labels, verifiedLanguages }];
  });
}
