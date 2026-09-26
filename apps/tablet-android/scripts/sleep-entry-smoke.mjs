// Verifies the automatic idle -> sleep sequence in WallDeck's debug Android WebView.
import assert from "node:assert/strict";

const baseUrl = "http://127.0.0.1:8787";
const pages = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = pages.find((candidate) => new URL(candidate.url).pathname === "/panel");
assert.ok(page, "Open WallDeck /panel on the debug tablet first");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout")); }, 10_000);
    pending.set(id, (result) => { clearTimeout(timer); result.error ? reject(new Error(result.error.message)) : resolve(result.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}

const originalSettings = await request("/api/settings");
try {
  await cdp("Runtime.enable");
  await cdp("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const co2 = await request("/api/ha/entities/sensor.mh_z19_co2_value_2");
  const value = Number(co2.state);
  assert.ok(Number.isFinite(value), "The test HA entity must have a numeric state");
  await request("/api/views/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewId: "photos" }) });
  const testSettings = structuredClone(originalSettings);
  Object.assign(testSettings.ambientSleep, {
    enabled: true,
    source: "home-assistant",
    homeAssistantEntityId: co2.entityId,
    homeAssistantSleepBelow: value + 1,
    homeAssistantResetAbove: value + 100,
    cameraEnabled: false,
  });
  await request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(testSettings) });

  const started = performance.now();
  const samples = [];
  while (performance.now() - started < 4_000) {
    const sample = await evaluate(`({ view: document.querySelector('.panel-router')?.dataset.view ?? null, state: document.querySelector('.assistant-face')?.dataset.state ?? null })`);
    samples.push({ at: Math.round(performance.now() - started), ...sample });
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const idle = samples.find((sample) => sample.view === "assistant-expressive" && sample.state === "idle");
  const sleep = samples.find((sample) => sample.state === "sleep");
  assert.ok(idle, "Automatic sleep must first render idle");
  assert.ok(sleep, "Automatic sleep must finish in sleep");
  assert.ok(sleep.at - idle.at >= 1_300, `Idle was visible for only ${sleep.at - idle.at} ms`);
  console.log(JSON.stringify({ result: "PASS", entity: co2.entityId, value, idleAtMs: idle.at, sleepAtMs: sleep.at, idleDurationMs: sleep.at - idle.at }, null, 2));
} finally {
  await request("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(originalSettings) });
  await request("/api/views/activate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewId: "photos" }) });
  socket.close();
}
