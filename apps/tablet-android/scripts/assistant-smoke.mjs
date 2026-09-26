// Exercises only WallDeck's debug Android WebView through an ADB-forwarded socket.
import assert from 'node:assert/strict';
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const page = pages.find(p => new URL(p.url).pathname === '/panel');
assert.ok(page, 'Open WallDeck /panel on the debug tablet first');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout')); }, 25000);
    pending.set(id, result => { clearTimeout(timer); result.error ? reject(new Error(result.error.message)) : resolve(result.result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  await cdp('Runtime.enable');
  await cdp('Page.reload', { ignoreCache: true });
  await new Promise(resolve => setTimeout(resolve, 2200));
  await evaluate(`fetch('/api/views/activate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({viewId:'assistant-demo'})}).then(r=>r.json())`);
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(await evaluate(`document.querySelector('.panel-router').dataset.view`), 'assistant-demo');
  const results = await evaluate(`(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const names = ['Spokój','Pobudka','Słucham','Myślę','Mówię','Gotowe','Ups…','Sen'];
    const states = [];
    for (const name of names) {
      [...document.querySelectorAll('.assistant-states button')].find(b=>b.textContent===name).click();
      await wait(70);
      states.push(document.querySelector('.assistant-face').dataset.state);
    }
    const buttons = [...document.querySelectorAll('.assistant-states button')];
    buttons[1].click(); await wait(900);
    const attentionNext = document.querySelector('.assistant-face').dataset.state;
    buttons[5].click(); await wait(2350);
    const successNext = document.querySelector('.assistant-face').dataset.state;
    document.querySelector('.assistant-options input[type=checkbox]').click();
    await wait(700);
    const paths = [];
    for (let i=0;i<5;i++) { paths.push(document.querySelector('g[transform="translate(600 455)"] path').getAttribute('d')); await wait(100); }
    const frames = [];
    let previous = performance.now();
    const started = previous;
    await new Promise(resolve => { function frame(t) { frames.push(t-previous); previous=t; if(t-started<10000) requestAnimationFrame(frame); else resolve(); } requestAnimationFrame(frame); });
    frames.shift(); frames.sort((a,b)=>a-b);
    return { states, attentionNext, successNext, mouthChanges:new Set(paths).size, width:innerWidth,height:innerHeight, visible:document.visibilityState, frameCount:frames.length, medianMs:frames[Math.floor(frames.length*.5)],p95Ms:frames[Math.floor(frames.length*.95)],maxMs:Math.max(...frames) };
  })()`);
  assert.deepEqual(results.states, ['idle','attention','listening','thinking','speaking','success','error','sleep']);
  assert.equal(results.attentionNext, 'listening');
  assert.equal(results.successNext, 'idle');
  assert.ok(results.mouthChanges > 1, 'Audio simulation must change mouth geometry');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ result: 'PASS', ...results, errors }, null, 2));
  await evaluate(`document.querySelector('.assistant-options input[type=checkbox]').click(); document.querySelector('.assistant-states button').click(); document.querySelector('.assistant-controls-toggle').click()`);
} finally { ws.close(); }
