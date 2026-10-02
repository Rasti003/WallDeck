import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, SpeakerObservationSession } from "../dist/speaker-observer.js";

test("cosineSimilarity handles normalized and incompatible vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), 0);
});

test("speaker session anchors the first voice and classifies later windows", async () => {
  const results = [
    { speech: true, speechSeconds: 2.1, processingMs: 80, embedding: [1, 0] },
    { speech: true, speechSeconds: 2.4, processingMs: 75, embedding: [.98, .1] },
    { speech: true, speechSeconds: 2.2, processingMs: 72, embedding: [0, 1] },
  ];
  const observations = [];
  const client = { analyze: async () => results.shift() };
  const session = new SpeakerObservationSession(client, observation => observations.push(observation));
  const window = Buffer.alloc(24_000 * 2 * 3);
  session.append(window);
  session.append(window);
  session.append(window);
  await session.finish();

  assert.deepEqual(observations.map(item => item.relation), ["anchor", "same", "different"]);
  assert.deepEqual(observations.map(item => item.label), ["Aktywny mówca", "Aktywny mówca", "Inny głos"]);
  assert.equal(observations.every(item => item.engine === "silero-ecapa"), true);
});

test("speaker session ignores windows without enough speech", async () => {
  const observations = [];
  const session = new SpeakerObservationSession(
    { analyze: async () => ({ speech: false, speechSeconds: 0.1, processingMs: 30 }) },
    observation => observations.push(observation),
  );
  session.append(Buffer.alloc(24_000 * 2 * 3));
  await session.finish();
  assert.equal(observations.length, 0);
});
