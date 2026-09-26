// Verifies Music return navigation on Android; --simulate-playing injects only playback events, never starts audio.
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
 await save({...originalSettings,ambientSleep:{...originalSettings.ambientSleep,enabled:false},viewRouter:{...originalSettings.viewRouter,inactivityAction:{...originalSettings.viewRouter.inactivityAction,enabled:true,sourceView:'ha',targetView:'photos',seconds:5,assistantIdleSeconds:3}}});
 await cdp('Page.reload',{ignoreCache:true});await pause(1500);
 if(process.argv.includes('--simulate-playing')) await evaluate(`window.__dancePlaying=true;window.__danceFixture=setInterval(()=>{if(document.querySelector('.panel-router')?.dataset.view!=='music')window.dispatchEvent(new CustomEvent('wallpanel:musicStateChanged',{detail:{connection:'connected',paused:!window.__dancePlaying,installed:true,error:null,positionMs:0,observedAt:Date.now(),speed:1,shuffle:false,repeat:0,context:'',artwork:null,track:{uri:'test',title:'Test routingu',artist:'',album:'',durationMs:60000},capabilities:{}}}))},50)`);
 await activate('music');await waitView('music');
 await evaluate(`document.querySelector('.music-home').click()`);
 await waitView('ha');
 await waitView('assistant-expressive','dancing');
 await waitView('music');
 console.log('PASS: Music -> HA -> dancing -> Music');
 await evaluate(`document.querySelector('.music-home').click()`);await waitView('ha');await waitView('assistant-expressive','dancing');
 const start=Date.now();
 await evaluate(`window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
 await waitView('music',null,1500);
 const elapsed=Date.now()-start;assert.ok(elapsed<500,'Tap must bypass transition animations: '+elapsed);
 console.log('PASS: dance tap -> Music in '+elapsed+' ms');
 if(process.argv.includes('--simulate-playing')) {
  await evaluate(`document.querySelector('.music-home').click()`);await waitView('ha');await waitView('assistant-expressive','dancing');
  await evaluate('window.__dancePlaying=false');await waitView('photos');
  console.log('PASS: pause during dancing falls back to photos');
  await evaluate('window.__dancePlaying=true');await waitView('assistant-expressive','dancing');await waitView('music');
  console.log('PASS: playback start from photos opens dance then Music');
 }
} finally {await evaluate('clearInterval(window.__danceFixture)');await save(originalSettings);await activate(originalView);socket.close();}
