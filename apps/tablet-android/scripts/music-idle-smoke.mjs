// Requires paused Spotify on the connected tablet; verifies real inactivity timing.
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

const originalSettings = await request('/api/settings');
const originalView = (await request('/api/views')).current;
const pause = ms => new Promise(r=>setTimeout(r,ms));
const activate = viewId => request('/api/views/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({viewId})});
const save = settings => request('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settings)});
const read = () => evaluate(`({view:document.querySelector('[data-rendered-view]')?.dataset.renderedView,state:document.querySelector('.assistant-face')?.dataset.state})`);
async function waitView(view,state,timeout=9000){const start=Date.now();while(Date.now()-start<timeout){const value=await read();if(value.view===view&&(!state||value.state===state))return Date.now()-start;await pause(60)}throw new Error('Missing '+view+'/'+state+' '+JSON.stringify(await read()));}
try {
 await save({...originalSettings,ambientSleep:{...originalSettings.ambientSleep,enabled:false},viewRouter:{...originalSettings.viewRouter,inactivityAction:{...originalSettings.viewRouter.inactivityAction,assistantIdleSeconds:3}}});
 await activate('music');await cdp('Page.reload',{ignoreCache:true});await pause(1500);await waitView('music');
 await pause(20000);assert.equal((await read()).view,'music');
 await evaluate(`window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
 await pause(15000);assert.equal((await read()).view,'music');
 console.log('PASS: activity resets paused Music timer');
 await waitView('assistant-expressive','idle',18000);
 await waitView('photos');console.log('PASS: paused Music -> 30 seconds inactivity -> idle -> photos');
} finally {await save(originalSettings);await activate(originalView);await cdp('Page.reload',{ignoreCache:true});socket.close();}
