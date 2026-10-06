import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { YoutubeService, durationSeconds, registerYoutube } from "../dist/youtube.js";
import { executeAssistantTool } from "../dist/assistant-tools.js";
import { defaultSettings } from "@walldeck/contracts";
import Fastify from "fastify";

const channelId="UC1234567890123456789012";
const video=(id,duration="PT5M",extra={})=>({id,snippet:{title:id,channelTitle:"Konopsky",channelId,publishedAt:"2026-10-06T10:00:00Z",liveBroadcastContent:"none",thumbnails:{medium:{url:"https://i.ytimg.com/vi/test/mqdefault.jpg"}}},contentDetails:{duration},status:{embeddable:true,privacyStatus:"public"},...extra});
async function fixture(t,handler) {
  const root=await mkdtemp(path.join(tmpdir(),"walldeck-youtube-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const requests=[],commands=[],events=[];let view="ha";
  const service=new YoutubeService(root,{currentView:()=>view,activateView:v=>{view=v;},broadcast:e=>events.push(e),command:async(name,args)=>{commands.push({name,args});return {}; }},async(url)=>{
    const parsed=new URL(url);requests.push(parsed);return Response.json(await handler(parsed.pathname.split("/").at(-1),parsed.searchParams));
  });
  await service.configure({enabled:true,apiKey:"fixture-secret-never-in-response"});
  return {service,root,requests,commands,events,get view(){return view;}};
}
test("duration handles boundaries, hours and malformed data",()=>{
  assert.equal(durationSeconds("PT3M"),180);assert.equal(durationSeconds("PT3M1S"),181);assert.equal(durationSeconds("P1DT1H2M3S"),90123);assert.equal(durationSeconds("broken"),0);
});
test("search returns choices, caches metadata and never issues play",async t=>{
  const f=await fixture(t,(endpoint)=>endpoint==="search"?{items:[{id:{videoId:"abcdefghijk"}},{id:{videoId:"ABCDEFGHIJK"}}]}:{items:[video("abcdefghijk"),video("ABCDEFGHIJK")]});
  const found=await f.service.search({query:"test"});assert.equal(found.requiresSelection,true);assert.equal(found.results.length,2);assert.equal(f.commands.length,0);assert.equal(f.view,"youtube");assert.equal(f.service.state.returnView,"ha");
  await f.service.search({query:"test"});assert.equal(f.requests.length,2);
  await f.service.play({index:2});assert.equal(f.commands[0].args.video.videoId,"ABCDEFGHIJK");assert.equal(f.service.state.playing,false);
  await assert.rejects(f.service.play({index:5}),/niedostępny/);await assert.rejects(f.service.play({index:1,videoId:"abcdefghijk"}),/albo/);
});
test("latest skips <=180s, live, nonembeddable, private; known alias bypasses search",async t=>{
  const f=await fixture(t,(endpoint)=>{
    if(endpoint==="channels")return {items:[{id:channelId,snippet:{title:"Konopsky"},contentDetails:{relatedPlaylists:{uploads:"UU1234567890123456789012"}}}]};
    if(endpoint==="playlistItems")return {items:["shortfilm01","private0001","livevideo01","noembed0001","longvideo01"].map(videoId=>({contentDetails:{videoId}}))};
    if(endpoint==="videos")return {items:[video("shortfilm01","PT3M"),video("private0001","PT9M",{status:{privacyStatus:"private",embeddable:true}}),video("livevideo01","PT9M",{snippet:{liveBroadcastContent:"live"}}),video("noembed0001","PT9M",{status:{privacyStatus:"public",embeddable:false}}),video("longvideo01","PT3M1S")]};
    throw Error("search must not be called");
  });
  await f.service.resolveChannel(channelId);await f.service.editChannels(f.service.channels.map(c=>({...c,aliases:["Konopsky","konopski"]})));
  await f.service.latest("konopski");assert.equal(f.service.state.video.videoId,"longvideo01");assert.equal(f.requests.filter(r=>r.pathname.endsWith("/search")).length,0);
  await f.service.latest("konopski");assert.equal(f.requests.filter(r=>r.pathname.endsWith("/playlistItems")).length,1);
});
test("ambiguous channel returns candidates without playing or persisting a guess",async t=>{
  const f=await fixture(t,()=>({items:[{id:{channelId},snippet:{title:"One"}},{id:{channelId:"UCabcdefghijklmnopqrstuv"},snippet:{title:"Two"}}]}));
  const result=await f.service.latest("ambiguous");assert.equal(result.requiresSelection,true);assert.equal(result.candidates.length,2);assert.equal(f.commands.length,0);assert.equal(f.service.channels.length,0);
});
test("latest walks uploads pages when first page contains only short films",async t=>{
  const f=await fixture(t,(endpoint,params)=>{
    if(endpoint==="channels")return {items:[{id:channelId,snippet:{title:"Channel"},contentDetails:{relatedPlaylists:{uploads:"UU1234567890123456789012"}}}]};
    if(endpoint==="playlistItems")return params.get("pageToken")?{items:[{contentDetails:{videoId:"longvideo01"}}]}:{items:[{contentDetails:{videoId:"shortfilm01"}}],nextPageToken:"second"};
    return {items:[video(params.get("id"),params.get("id")==="shortfilm01"?"PT3M":"PT4M")]};
  });
  await f.service.latest(channelId);assert.equal(f.service.state.video.videoId,"longvideo01");assert.equal(f.requests.filter(r=>r.pathname.endsWith("/playlistItems")).length,2);
});
test("reports persist position, reject old sessions and restore exact previous view on end",async t=>{
  const f=await fixture(t,()=>({items:[video("longvideo01")]}));await f.service.play({videoId:"longvideo01"});
  const report={sessionId:f.service.state.sessionId,videoId:"longvideo01",positionSeconds:90,playing:false,volume:70,status:"paused",error:null};
  await f.service.report(report);assert.equal(JSON.parse(await readFile(path.join(f.root,"youtube.json"),"utf8")).history[0].positionSeconds,90);
  await f.service.play({videoId:"longvideo01"});assert.deepEqual(await f.service.report(report),{ok:false});
  await f.service.report({...report,sessionId:f.service.state.sessionId,status:"ended"});assert.equal(f.view,"ha");
  assert.equal(JSON.stringify(await f.service.status()).includes("fixture-secret"),false);assert.equal((await readFile(path.join(f.root,"youtube-api-key.secret.json"),"utf8")).includes("fixture-secret"),false);
});
test("controls reject invalid values; disabled shared tool cannot execute",async t=>{
  const f=await fixture(t,()=>({items:[]}));
  await assert.rejects(f.service.control({action:"volume",value:101}),/Głośność/);await assert.rejects(f.service.control({action:"seek"}),/wymagane/);
  await assert.rejects(executeAssistantTool("youtube_search",{query:"test"},{youtube:f.service},{...defaultSettings.mcp.tools,youtube_search:false}),/wyłączone/);
  await f.service.configure({enabled:false});await assert.rejects(f.service.search({query:"test"}),/wyłączony/);
});
test("routes do not disclose secret and missing key produces a controlled failure",async t=>{
  const f=await fixture(t,()=>({items:[]}));const app=Fastify();t.after(()=>app.close());registerYoutube(app,f.service);
  const config=await app.inject({url:"/api/youtube/config"});assert.equal(config.statusCode,200);assert.equal(config.body.includes("fixture-secret"),false);
  await f.service.configure({enabled:true,clearKey:true});await assert.rejects(f.service.test(),/Zapisz klucz/);
});
