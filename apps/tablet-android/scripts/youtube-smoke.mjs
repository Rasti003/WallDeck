// Debug Android WebView only: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>.
// This smoke checks the real view/iframe isolation without a Data API key or playing a video.
import assert from "node:assert/strict";
const base=process.env.WALLDECK_URL ?? "http://192.168.31.153:8080";
const targets=await (await fetch("http://127.0.0.1:9222/json")).json();
const page=targets.find(p=>p.url.startsWith(base));assert.ok(page,"WallDeck debug WebView must be running");
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map();
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}};
async function command(method,params={}) {
  const response=await new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method}`));},10000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});socket.send(JSON.stringify({id,method,params}));});
  assert.ok(!response.error,JSON.stringify(response.error));return response.result;
}
async function evaluate(expression,contextId) {
  const result=await command("Runtime.evaluate",{expression,contextId,awaitPromise:true,returnByValue:true});
  assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const activate=viewId=>fetch(`${base}/api/views/activate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({viewId})});
const original=(await (await fetch(`${base}/api/views`)).json()).current;
try {
  await command("Page.enable");await command("Runtime.enable");await command("Page.reload",{ignoreCache:true});await delay(2000);
  const native=await evaluate(`new Promise((resolve,reject)=>{
    const bridge=window.WallPanelNative;if(!bridge)return reject(Error("No trusted bridge"));
    const previous=bridge.onmessage;const id="youtube-smoke-capabilities";
    const timeout=setTimeout(()=>{bridge.onmessage=previous;reject(Error("Bridge timeout"));},5000);
    bridge.onmessage=event=>{const m=JSON.parse(event.data);if(m.id===id){clearTimeout(timeout);bridge.onmessage=previous;resolve(m.result);}else previous?.(event);};
    bridge.postMessage(JSON.stringify({id,method:"capabilities",args:{}}));
  })`);
  assert.ok(native.bridgeVersion>=8,"Existing bridge version must be preserved");
  await activate("youtube");
  let iframe;
  for(let attempt=0;attempt<20;attempt++) {
    iframe=await evaluate(`({title:document.querySelector('.youtube-view h1')?.textContent,src:document.querySelector('.youtube-player iframe')?.src,errors:Array.from(document.querySelectorAll('.youtube-view [role=alert]')).map(e=>e.textContent)})`);
    if(iframe.src)break;await delay(500);
  }
  assert.equal(iframe.title,"Co dziś oglądamy?");assert.ok(iframe.src?.startsWith("https://www.youtube.com/embed/"),JSON.stringify(iframe));assert.deepEqual(iframe.errors,[]);
  const frames=(await command("Page.getFrameTree")).frameTree;
  const flatten=tree=>[tree.frame,...(tree.childFrames??[]).flatMap(flatten)];
  const youtube=flatten(frames).find(f=>f.url.startsWith("https://www.youtube.com/embed/"));assert.ok(youtube);
  const world=await command("Page.createIsolatedWorld",{frameId:youtube.id,worldName:"youtube-smoke-isolation"});
  assert.equal(await evaluate("typeof window.WallPanelNative",world.executionContextId),"undefined","YouTube iframe must not receive native bridge");
  console.log(JSON.stringify({result:"PASS",bridgeVersion:native.bridgeVersion,view:"youtube",officialIframe:true,iframeNativeBridge:false,playbackTested:false,dataApiTested:false}));
} finally {await activate(original);socket.close();}
