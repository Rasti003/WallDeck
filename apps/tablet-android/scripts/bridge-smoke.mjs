// Debug APK only. Forward WebView devtools socket to localhost:9222 before running.
// This script exercises the Android app, never a user's desktop browser.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = pages.find(p => p.url.startsWith('http://127.0.0.1:8080'));
assert.ok(page, 'Diagnostic panel must be open');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } };
function cdp(method, params) { return new Promise(resolve => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!response.result.exceptionDetails, JSON.stringify(response.result.exceptionDetails));
  return response.result.result.value;
}
try {
  const results = await evaluate(`(async()=>{
    const out={};
    for(const method of ['capabilities','deviceInfo','battery','appVersion','permissions']) out[method]=await WallPanel.call(method);
    const brightness=await WallPanel.call('brightness'), volume=await WallPanel.call('mediaVolume'), awake=await WallPanel.call('keepAwake');
    try {
      out.brightness=await WallPanel.call('brightness',{value:0.6});
      out.mediaVolume=await WallPanel.call('mediaVolume',{value:volume.value});
      out.keepAwake=await WallPanel.call('keepAwake',{enabled:true});
      out.haptics=await WallPanel.call('haptics');
      for(const [name,args] of [['brightness',{value:2}],['mediaVolume',{value:-1}],['unknown',{}],['signChallenge',{challenge:'short'}]]) {
        try { await WallPanel.call(name,args); out[name+'Rejected']=false } catch {out[name+'Rejected']=true}
      }
    } finally {
      await WallPanel.call('brightness',brightness); await WallPanel.call('mediaVolume',volume); await WallPanel.call('keepAwake',awake);
    }
    return out;
  })()`);
  assert.equal(results.capabilities.bridgeVersion, 1);
  assert.equal(results.keepAwake.enabled, true);
  for (const method of ['brightness','mediaVolume','unknown','signChallenge']) assert.equal(results[method+'Rejected'], true);
  if (process.env.WALLPANEL_TEST_KEY) {
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
    const signed = await evaluate(`WallPanel.call('signChallenge',{challenge:'${challenge}'})`);
    const expected = createHmac('sha256', process.env.WALLPANEL_TEST_KEY)
      .update(`wallpanel-v1\nhttp://127.0.0.1:8080\n${signed.deviceId}\n${challenge}`)
      .digest('base64');
    assert.equal(signed.signature, expected, 'HMAC signature must match without exposing Device Key');
    console.log('PASS: Device Key survived restart and signs challenges correctly');
  }
  console.log(JSON.stringify(results, null, 2));
  const frame = await evaluate(`new Promise(resolve=>{
    const f=document.createElement('iframe');f.src='http://localhost:8080/';
    const listener=e=>{if(e.source===f.contentWindow){window.removeEventListener('message',listener);f.remove();resolve(e.data)}};
    window.addEventListener('message',listener);
    f.src='http://localhost:8080/probe.html';document.body.append(f);
    setTimeout(()=>{window.removeEventListener('message',listener);f.remove();resolve('timeout')},3000);
  })`);
  assert.equal(frame, 'undefined', 'Foreign origin must not receive native bridge');
  const sameFrame = await evaluate(`new Promise(resolve=>{
    const f=document.createElement('iframe');f.src='/probe.html?same=1';
    const listener=e=>{if(e.source===f.contentWindow){window.removeEventListener('message',listener);f.remove();resolve(e.data)}};
    window.addEventListener('message',listener);document.body.append(f);
    setTimeout(()=>{window.removeEventListener('message',listener);f.remove();resolve('timeout')},3000);
  })`);
  assert.equal(sameFrame, 'no-native-response', 'Same-origin subframe requests must be rejected');
  console.log('PASS: bridge methods, input validation, foreign and same-origin iframe isolation');
} finally { ws.close(); }
