import assert from "node:assert/strict";
import test from "node:test";
import { LiveToolQueue } from "../dist/live-tool-queue.js";
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
for (const completeFirst of [true, false]) test(`continuation waits for outputs and completion, completionFirst=${completeFirst}`, async () => {
  const events = [], wait = deferred();
  const queue = new LiveToolQueue(() => events.push("continue"), () => events.push("done"), error => { throw error; });
  queue.enqueue("d", "call", async () => { events.push("started"); await wait.promise; events.push("output"); });
  queue.enqueue("d", "call", async () => { events.push("duplicate"); });
  await tick();
  events.push("audio");
  if (completeFirst) queue.completed("d");
  assert.deepEqual(events, ["started", "audio"]);
  wait.resolve(); await tick();
  if (!completeFirst) { assert.deepEqual(events, ["started", "audio", "output"]); queue.completed("d"); }
  assert.deepEqual(events, ["started", "audio", "output", "continue"]);
  queue.completed("d");
  assert.equal(events.at(-1), "done");
});
test("shutdown suppresses continuations and queued mutations", async () => {
  const wait = deferred(), events = [];
  const queue = new LiveToolQueue(() => events.push("continue"), () => events.push("done"), () => {});
  queue.enqueue("d", "a", () => wait.promise);
  queue.enqueue("d", "b", async () => events.push("mutation"));
  queue.completed("d"); await tick(); queue.stop(); wait.resolve(); await tick();
  assert.deepEqual(events, []);
});
