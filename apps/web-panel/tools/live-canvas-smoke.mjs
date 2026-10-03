// Opt-in integration test: uses the configured paid API and changes tablet Canvas.
// Sends a text turn plus silent clocking PCM. Does not test the microphone/speaker.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../apps/server/package.json", import.meta.url));
const WebSocket = require("ws");
const base = process.env.WALLDECK_URL ?? "http://127.0.0.1:8080";
const prompt = process.argv[2] ?? "Opowiedz krótko o kotach rasy sfinks i pokaż prezentację ze zdjęciami.";
const expectCanvas = !process.argv.includes("--voice-only");
const started = Date.now();
const summary = { firstAudioMs: null, firstTextMs: null, firstImagesMs: null, transcript: "", errors: [], canvas: [] };
const events = new WebSocket(base.replace(/^http/, "ws") + "/api/events");
events.on("message", raw => {
  const event = JSON.parse(raw);
  if (event.type !== "assistant.canvas") return;
  const canvas = event.canvas;
  const ms = Date.now() - started;
  summary.canvas.push({ ms, id: canvas.id, status: canvas.status, imagesStatus: canvas.imagesStatus, images: canvas.images.length });
  if (canvas.status === "ready" && summary.firstTextMs === null) summary.firstTextMs = ms;
  if (canvas.images.length && summary.firstImagesMs === null) summary.firstImagesMs = ms;
  console.log("Canvas", JSON.stringify(summary.canvas.at(-1)));
});
const socket = new WebSocket(base.replace(/^http/, "ws") + "/api/assistant/live?initial=" + encodeURIComponent(prompt), { headers: { Origin: base } });
let feed;
const deadline = setTimeout(() => { summary.errors.push("test deadline"); socket.close(); }, 65_000);
try {
  await new Promise((resolve, reject) => {
    socket.on("error", reject);
    socket.on("close", resolve);
    socket.on("message", raw => {
      const message = JSON.parse(raw);
      if (message.type === "ready") feed = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "audio", audio: Buffer.alloc(9600).toString("base64") }));
      }, 200);
      if (message.type === "audio" && summary.firstAudioMs === null) {
        summary.firstAudioMs = Date.now() - started;
        console.log("First audio", summary.firstAudioMs);
      }
      if (message.type === "outputTranscript") summary.transcript += message.delta;
      if (message.type === "error") summary.errors.push(message.error);
    });
  });
  if (expectCanvas && summary.canvas.length && summary.canvas.at(-1).imagesStatus === "loading") {
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  console.log(JSON.stringify(summary, null, 2));
  assert.equal(summary.errors.length, 0);
  assert.ok(summary.firstAudioMs !== null, "Live returned audio");
  if (expectCanvas) {
    assert.ok(summary.firstTextMs !== null, "Luna published readable text");
    assert.ok(summary.firstImagesMs !== null, "Canvas received real images");
    assert.ok(summary.firstAudioMs < summary.firstImagesMs, "Speech did not wait for pictures");
  }
} finally {
  clearTimeout(deadline);
  clearInterval(feed);
  socket.close();
  events.close();
}
