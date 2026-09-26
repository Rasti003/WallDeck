// Tests native tablet volume through the Music UI; restores volume, settings and view.
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
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
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
async function native(method,args={}) {
 return evaluate(`new Promise((resolve,reject)=>{const old=WallPanelNative.onmessage;const timer=setTimeout(()=>{WallPanelNative.onmessage=old;reject(new Error('timeout'))},4000);WallPanelNative.onmessage=e=>{const m=JSON.parse(e.data);if(m.id==='volume-test'){clearTimeout(timer);WallPanelNative.onmessage=old;resolve(m.result)}else old?.(e)};WallPanelNative.postMessage(JSON.stringify({id:'volume-test',method:${JSON.stringify(method)},args:${JSON.stringify(args)}}))})`);
}
let initial;
try {
 await save({...originalSettings,ambientSleep:{...originalSettings.ambientSleep,enabled:false}});
 await activate('music');await cdp('Page.reload',{ignoreCache:true});await pause(1800);await activate('music');await waitView('music');
 initial=(await native('audio.getOutputs')).volume;
 await evaluate(`document.querySelector('.music-volume-trigger').click()`);await pause(500);
 await evaluate(`document.querySelector('[aria-label="Ciszej"]').click()`);await pause(500);
 const lower=(await native('audio.getOutputs')).volume;assert.ok(lower<=initial);console.log('PASS lower volume');
 await evaluate(`document.querySelector('.music-volume-mute').click()`);await pause(500);
 assert.equal((await native('audio.getOutputs')).volume,0);console.log('PASS mute');
 await evaluate(`document.querySelector('.music-volume-mute').click()`);await pause(500);
 assert.ok((await native('audio.getOutputs')).volume>0);console.log('PASS restore');
 await pause(6500);assert.equal(await evaluate(`!!document.querySelector('.music-volume-popup')`),false);console.log('PASS auto close');
} finally {if(initial!==undefined)await native('mediaVolume',{value:initial});await save(originalSettings);await activate(originalView);socket.close();}
