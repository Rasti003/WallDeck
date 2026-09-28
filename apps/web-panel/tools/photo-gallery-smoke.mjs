// Tests gallery gestures on a connected Android WebView; restores settings and view.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const adb = process.env.ADB;
const serial = process.env.ANDROID_SERIAL;
assert.ok(adb && serial, 'Set ADB and ANDROID_SERIAL');

const baseUrl = process.env.WALLDECK_URL ?? "http://127.0.0.1:8787";
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

try {
 await save({...originalSettings,ambientSleep:{...originalSettings.ambientSleep,enabled:false}});
 await activate('photos'); await cdp('Page.reload',{ignoreCache:true}); await pause(2200); await activate('photos'); await waitView('photos');
 const bounds=await evaluate(`({w:innerWidth,h:innerHeight})`);
 const physical=execFileSync(adb,['-s',serial,'shell','wm','size'],{encoding:'utf8'}).match(/(\d+)x(\d+)/);
 // Device is mounted landscape. Map WebView coordinates to the current display rotation.
 const w=Math.max(Number(physical[1]),Number(physical[2])),h=Math.min(Number(physical[1]),Number(physical[2]));
 const swipe=(x1,y1,x2,y2,ms)=>execFileSync(adb,['-s',serial,'shell','input','swipe',String(Math.round(x1*w)),String(Math.round(y1*h)),String(Math.round(x2*w)),String(Math.round(y2*h)),String(ms)]);
 const images=()=>evaluate(`Array.from(document.querySelectorAll('.photo-layout img')).map(i=>i.getAttribute('src'))`);
 const before=await images();assert.ok(before.length);
 swipe(.75,.6,.25,.6,250);await pause(1800);const after=await images();assert.notDeepEqual(after,before);assert.equal((await read()).view,'photos');console.log('PASS swipe next, no HA');
 swipe(.25,.6,.75,.6,250);await pause(1800);assert.deepEqual(await images(),before);console.log('PASS swipe previous restores actual frame');
 swipe(.5,.6,.5,.6,850);await pause(500);assert.equal(await evaluate(`!!document.querySelector('[aria-label="Zdjęcia"]')`),true);assert.equal((await read()).view,'photos');console.log('PASS long press menu, no HA');
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Wszystkie zdjęcia')).click()`);await pause(500);assert.equal(await evaluate(`document.querySelectorAll('.photo-library button').length`),60);console.log('PASS tablet library');
 swipe(.65,.8,.65,.3,350);await pause(500);assert.ok(await evaluate(`document.querySelector('.photo-dialog').scrollTop>0`));console.log('PASS native vertical library scrolling');
 await pause(31000);assert.equal((await read()).view,'photos');assert.equal(await evaluate(`!!document.querySelector('.photo-library')`),true);console.log('PASS browsing stays open beyond idle timeout');
 await evaluate(`document.querySelector('.photo-library button').click()`);await pause(1800);assert.equal(await evaluate(`!!document.querySelector('[aria-label="Zdjęcia"]')`),false);assert.equal((await read()).view,'photos');console.log('PASS select photo');
 swipe(.5,.2,.5,.5,300);await pause(600);assert.equal(await evaluate(`!!document.querySelector('.tablet-menu-glass')`),true);await evaluate(`document.querySelector('[aria-label="Zamknij menu"]').click()`);console.log('PASS global swipe-down menu unchanged');
 await evaluate(`{const id='gallery-smoke-'+Date.now();for(let i=0;i<2;i++)window.dispatchEvent(new CustomEvent('walldeck:notification',{detail:{id,message:'Test powiadomienia',kind:'info',durationMs:700}}))}`);await pause(150);assert.equal(await evaluate(`document.querySelectorAll('.app-notification').length`),1);await pause(900);assert.equal(await evaluate(`document.querySelectorAll('.app-notification').length`),0);console.log('PASS global notification deduplication and timeout');
} finally { await save(originalSettings); await activate(originalView); socket.close(); }


