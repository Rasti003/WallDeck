import assert from "node:assert/strict";
import test from "node:test";
import { listElevenLabsVoices, renderElevenLabsSpeech } from "../dist/elevenlabs.js";

test("ElevenLabs speech keeps the API key in a header and requests tablet PCM", async () => {
  let request;
  const audio = await renderElevenLabsSpeech("secret-key", "Dzień dobry", { model: "eleven_multilingual_v2", voiceId: "voice-1" }, "pcm_24000", async (url, init) => {
    request = { url: String(url), init };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
  assert.deepEqual([...audio], [1, 2, 3]);
  assert.match(request.url, /voice-1\/stream\?output_format=pcm_24000$/);
  assert.equal(request.init.headers["xi-api-key"], "secret-key");
  assert.equal(JSON.parse(request.init.body).model_id, "eleven_multilingual_v2");
  assert.equal(request.url.includes("secret-key"), false);
});

test("ElevenLabs voice list exposes only safe selection metadata", async () => {
  const voices = await listElevenLabsVoices("secret-key", async () => new Response(JSON.stringify({ voices: [{
    voice_id: "abc", name: "Polski głos", category: "professional", labels: { accent: "polish", ignored: 4 },
    verified_languages: [{ language: "pl", model_id: "eleven_multilingual_v2" }], preview_url: "https://secret.example/sample.mp3",
  }] }), { status: 200, headers: { "content-type": "application/json" } }));
  assert.deepEqual(voices, [{ voiceId: "abc", name: "Polski głos", category: "professional", labels: { accent: "polish" }, verifiedLanguages: ["pl"] }]);
  assert.equal(JSON.stringify(voices).includes("secret.example"), false);
});
