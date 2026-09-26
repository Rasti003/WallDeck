// Real debug Android WebView. Does not authorize Spotify, start audio or change volume.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.WALLDECK_URL ?? "http://127.0.0.1:8787";
const pages = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = pages.find(p => new URL(p.url).pathname === "/panel");
assert.ok(page, "Open /panel on the tablet and forward its WebView devtools socket to port 9222");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id) pending.get(m.id)?.(m); };
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout")); }, 12000);
    pending.set(id, m => { clearTimeout(timer); pending.delete(id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function request(path, body) {
  const response = await fetch(base + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  assert.ok(response.ok, path);
  return response.json();
}
const original = await request("/api/views");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await cdp("Page.reload", { ignoreCache: true });
  await pause(1800);
  await request("/api/views/activate", { viewId: "music" });
  await pause(1000);
  assert.equal(await evaluate("document.querySelector('[data-rendered-view]')?.dataset.renderedView"), "music");
  const result = await evaluate(`(async()=>{
    const original = WallPanelNative.onmessage;
    const requests = new Map(); let sequence = 0;
    WallPanelNative.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (requests.has(msg.id)) { requests.get(msg.id)(msg); requests.delete(msg.id); }
      else original?.(event);
    };
    const call = (method,args={}) => new Promise((resolve,reject)=>{
      const id='music-smoke-'+(++sequence);
      const timer=setTimeout(()=>{requests.delete(id);reject(new Error('Bridge timeout'))},4000);
      requests.set(id,msg=>{clearTimeout(timer);resolve(msg)});
      WallPanelNative.postMessage(JSON.stringify({id,method,args}));
    });
    try {
      const caps = await call('capabilities');
      const state = await call('music.getState');
      const outputs = await call('audio.getOutputs');
      const queue = await call('music.getQueue');
      const select = await call('audio.selectOutput',{id:'non-existent'});
      const invalid = await call('music.connect',{clientId:'not-a-client-id'});
      const brightness = await call('brightness');
      return {version:caps.result.bridgeVersion,spotify:caps.result.spotify,installed:state.result.installed,connection:state.result.connection,outputCount:outputs.result.outputs.length,currentOutput:outputs.result.currentOutput,queueSupported:queue.result.supported,selectSupported:select.result.supported,invalidRejected:Boolean(invalid.error),brightness:brightness.result.value};
    } finally { WallPanelNative.onmessage=original; }
  })()`);
  assert.equal(result.version, 3);
  assert.equal(result.spotify, true);
  assert.equal(result.installed, true);
  assert.equal(result.queueSupported, false);
  assert.equal(result.selectSupported, false);
  assert.equal(result.currentOutput, null);
  assert.equal(result.invalidRejected, true);
  assert.ok(result.outputCount > 0);
  const settings = await request("/api/settings");
  assert.ok(Math.abs(result.brightness - settings.viewBrightness.music) < .01);
  await evaluate("document.querySelector('.music-now h1').click()");
  assert.equal(await evaluate("document.querySelector('.panel-router').dataset.view"), "music");
  await evaluate("document.querySelector('.music-output').click()");
  await pause(300);
  assert.equal(await evaluate("document.querySelector('[role=dialog]')?.getAttribute('aria-label')"), "Wyjście audio");
  await evaluate("document.querySelector('.music-sheet-close').click()");
  await pause(300);
  if (process.env.WALLDECK_SCREENSHOT) {
    const shot = await cdp("Page.captureScreenshot", { format: "png" });
    await writeFile(process.env.WALLDECK_SCREENSHOT, Buffer.from(shot.data, "base64"));
  }
  await evaluate("document.querySelector('.music-home').click()");
  await pause(900);
  assert.equal(await evaluate("document.querySelector('[data-rendered-view]')?.dataset.renderedView"), "ha");
  await request("/api/views/activate", { viewId: "music" });
  await pause(900);
  assert.equal(await evaluate("document.querySelectorAll('[data-rendered-view]').length"), 1);
  console.log(JSON.stringify({ status: "PASS", ...result, homeNavigation: true, audioSheet: true, reentry: true, playbackTest: "NOT RUN: Spotify Client ID/authentication required" }, null, 2));
} finally {
  await request("/api/views/activate", { viewId: original.current });
  ws.close();
}
