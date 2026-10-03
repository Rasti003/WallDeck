import assert from "node:assert/strict";
import test from "node:test";
import { CanvasPresentationService } from "../dist/canvas-presentation.js";
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const request = { topic: "Husky", context: "", includeImages: true };
const text = { title: "Husky", summary: "Pies zaprzęgowy", bullets: [], metrics: [], charts: [], images: [], sources: [] };
function setup(timeout=1000) {
  const t=deferred(), i=deferred(), documents=[], logs=[];
  const service = new CanvasPresentationService({ text: () => t.promise, images: () => i.promise,
    publish: (doc,initial) => documents.push({ ...doc, initial }), log: (...args) => logs.push(args) }, timeout);
  return {service,t,i,documents,logs};
}
test("returns immediately, deduplicates, publishes text before delayed pictures", async () => {
  const {service,t,i,documents} = setup();
  const result=service.start(request);
  assert.equal(service.start(request).jobId,result.jobId);
  assert.equal(documents.length,1);
  t.resolve(text); await tick();
  assert.equal(documents.at(-1).summary,text.summary);
  assert.equal(documents.at(-1).imagesStatus,"loading");
  i.resolve({images:[{url:"/api/assistant/images/1",alt:"Husky"}],rejected:[]}); await tick();
  assert.equal(documents.at(-1).images.length,1);
  assert.equal(documents.at(-1).id,result.jobId);
  assert.equal(documents.filter(d=>d.initial).length,1);
});
test("images arriving first survive the text update", async () => {
  const {service,t,i,documents}=setup(); service.start(request);
  i.resolve({images:[{url:"/api/assistant/images/1",alt:"Husky"}],rejected:[]}); await tick();
  t.resolve(text); await tick(); assert.equal(documents.at(-1).images.length,1);
});
test("image failure keeps the readable text", async () => {
  const {service,t,i,documents}=setup(); service.start(request); t.resolve(text); i.reject(Error("network")); await tick();
  assert.equal(documents.at(-1).status,"ready"); assert.equal(documents.at(-1).imagesStatus,"unavailable");
});
test("navigation cancels late publication even if a provider ignores abort", async () => {
  const {service,t,i,documents}=setup(); service.start(request); service.cancel("navigation");
  t.resolve(text); i.resolve({images:[],rejected:[]}); await tick(); assert.equal(documents.length,1);
});
test("new request cannot be overwritten by an older worker", async () => {
  const first=deferred(), second=deferred(), docs=[];
  const service=new CanvasPresentationService({text: r=>r.topic==='A'?first.promise:second.promise, images:async()=>({images:[],rejected:[]}),publish:d=>docs.push(d),log:()=>{}});
  service.start({...request,topic:'A',includeImages:false});
  const latest=service.start({...request,topic:'B',includeImages:false});
  second.resolve({...text,title:'B'}); await tick(); first.resolve({...text,title:'A'}); await tick();
  assert.equal(docs.at(-1).id,latest.jobId); assert.equal(docs.at(-1).title,'B');
});
test("deadline publishes an honest failure and ignores late results", async () => {
  const {service,t,i,documents,logs}=setup(10); service.start(request);
  await new Promise(r=>setTimeout(r,30)); assert.equal(documents.at(-1).status,"error");
  assert.ok(logs.some(l=>l[3]==="timeout")); const count=documents.length;
  t.resolve(text); i.resolve({images:[],rejected:[]}); await tick(); assert.equal(documents.length,count);
});
