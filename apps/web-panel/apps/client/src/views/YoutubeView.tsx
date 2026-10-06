import { useContext, useEffect, useRef, useState } from "react";
import type { YoutubeState } from "@walldeck/contracts";
import { PanelContext } from "../panel-context";
import { api } from "../api";
import { attachYoutubePlayer, detachYoutubePlayer, loadYoutubeApi, youtubePlayerChanged, youtubeSnapshot, controlYoutube, type YoutubePlayer } from "../youtube-player";
import "./youtube.css";

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,"0")}`;
export function YoutubeView() {
  const [state,setState]=useState<YoutubeState|null>(null);
  const [query,setQuery]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const host=useRef<HTMLDivElement>(null); const player=useRef<YoutubePlayer|null>(null);
  const {setInteractionLocked}=useContext(PanelContext);
  useEffect(()=>{
    let cancelled=false; let interval:ReturnType<typeof setInterval>|undefined;
    setInteractionLocked(true);
    const refresh=()=>api.youtube.state().then(s=>{if(!cancelled)setState(s);}).catch(()=>undefined);
    void refresh();
    void loadYoutubeApi().then(YT=>{
      if(cancelled || !host.current)return;
      const target=document.createElement("div"); host.current.replaceChildren(target);
      player.current=new YT.Player(target,{width:"100%",height:"100%",playerVars:{playsinline:1,origin:location.origin,controls:1,rel:0},events:{
        onReady:(event:any)=>{if(cancelled)return; attachYoutubePlayer(event.target,report=>{ void api.youtube.report(report).then(refresh).catch(()=>{if(!cancelled)setError("Brak połączenia z WallDeck");}); });},
        onStateChange:(event:any)=>youtubePlayerChanged(event.data===0?"ended":event.data===1?"playing":event.data===2?"paused":"loading"),
        onAutoplayBlocked:()=>youtubePlayerChanged("blocked"),
        onError:(event:any)=>{youtubePlayerChanged("error",[101,150].includes(event.data)?"Autor nie zezwala na odtwarzanie tutaj. Otwórz film w YouTube.":event.data===153?"YouTube nie rozpoznał aplikacji. Sprawdź referer WebView.":"Film jest niedostępny w tym urządzeniu lub regionie.");},
      }});
    }).catch(e=>{if(!cancelled)setError(e.message);});
    interval=setInterval(()=>{const report=youtubeSnapshot();if(report && report.status!=="ended")void api.youtube.report(report).then(refresh).catch(()=>undefined);else void refresh();},5000);
    return()=>{cancelled=true;clearInterval(interval);const report=youtubeSnapshot("stopped");if(report)void api.youtube.report({...report,playing:false}).catch(()=>undefined);player.current?.destroy();detachYoutubePlayer();setInteractionLocked(false);};
  },[setInteractionLocked]);
  const run=async(task:()=>Promise<unknown>)=>{setBusy(true);setError("");try{await task();setState(await api.youtube.state());}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const control=(action:string,value?:number)=>run(()=>api.youtube.control({action,value}));
  return <section className="youtube-view" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}>
    <header><div><small>MEDIA · YOUTUBE</small><h1>{state?.video?.title??"Co dziś oglądamy?"}</h1><p>{state?.video?.channelName??"Wyszukaj film lub poproś asystenta o najnowszy materiał."}</p></div><button onClick={()=>void control("returnView")} aria-label="Zamknij YouTube">×</button></header>
    <form onSubmit={e=>{e.preventDefault();void run(()=>api.youtube.search(query));}}><input aria-label="Szukaj w YouTube" placeholder="Szukaj filmów…" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200}/><button disabled={busy||!query.trim()}>Szukaj</button></form>
    <div className={state?.video?"youtube-player":"youtube-player youtube-player-empty"} ref={host}/>
    {state?.status==="blocked"&&<button className="youtube-start" onClick={()=>{controlYoutube("resume");}}>▶ Uruchom film</button>}
    {(error||state?.error)&&<p role="alert">{error||state?.error} {state?.video&&<a href={`https://www.youtube.com/watch?v=${state.video.videoId}`} target="_blank" rel="noreferrer">Otwórz w YouTube ↗</a>}</p>}
    {state?.video&&<div className="youtube-controls"><button onClick={()=>void control(state.playing?"pause":"resume")}>{state.playing?"Ⅱ Pauza":"▶ Odtwórz"}</button><button onClick={()=>void control("seekBy",-30)}>−30 s</button><input type="range" aria-label="Pozycja filmu" min={0} max={state.video.durationSeconds} value={state.positionSeconds} onChange={e=>setState({...state,positionSeconds:Number(e.target.value)})} onPointerUp={e=>void control("seek",Number(e.currentTarget.value))} onKeyUp={e=>void control("seek",Number(e.currentTarget.value))}/><span>{clock(state.positionSeconds)} / {clock(state.video.durationSeconds)}</span><button onClick={()=>void control("seekBy",30)}>+30 s</button><input type="range" aria-label="Głośność YouTube" min={0} max={100} value={state.volume} onChange={e=>setState({...state,volume:Number(e.target.value)})} onPointerUp={e=>void control("volume",Number(e.currentTarget.value))} onKeyUp={e=>void control("volume",Number(e.currentTarget.value))}/><button onClick={()=>void control("stop")}>Stop</button></div>}
    <div className="youtube-results">{state?.results.map((v,index)=><button disabled={busy} key={v.videoId} onClick={()=>void run(()=>api.youtube.play(v.videoId))}><img src={v.thumbnail} alt=""/><div><small>{index+1} · {clock(v.durationSeconds)} · {new Date(v.publishedAt).toLocaleDateString("pl")}</small><strong>{v.title}</strong><span>{v.channelName}</span></div></button>)}</div>
  </section>;
}
