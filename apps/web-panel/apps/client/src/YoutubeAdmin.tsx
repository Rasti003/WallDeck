import { useEffect, useState } from "react";
import { api, type YoutubeAdminConfig } from "./api";

export function YoutubeAdmin() {
  const [config,setConfig]=useState<YoutubeAdminConfig|null>(null); const [key,setKey]=useState(""); const [channel,setChannel]=useState(""); const [status,setStatus]=useState(""); const [busy,setBusy]=useState(false);
  const [aliasDraft,setAliasDraft]=useState<Record<string,string>>({});
  const [candidates,setCandidates]=useState<Array<{channelId:string;canonicalName:string}>>([]);
  useEffect(()=>{void api.youtube.config().then(setConfig).catch(e=>setStatus(e.message));},[]);
  const run=async(task:()=>Promise<unknown>)=>{setBusy(true);setStatus("");try{await task();setConfig(await api.youtube.config());setStatus("Gotowe");}catch(e){setStatus(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const add=async(reference:string)=>{const result=await api.youtube.addChannel(reference);setCandidates(result.candidates??[]);if(result.channel)setChannel("");};
  if(!config)return <section className="admin-card"><p role="status">{status||"Ładowanie konfiguracji YouTube…"}</p></section>;
  return <div className="youtube-admin">
    <section className="admin-card admin-form"><span className="admin-kicker">Media</span><h2>YouTube</h2><p>Oficjalny player YouTube na tablecie. Klucz Data API jest szyfrowany na serwerze i nie trafia do playera.</p>
      <label className="switch-row"><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/> Włącz YouTube</label>
      <label>Klucz YouTube Data API v3 <input type="password" autoComplete="new-password" placeholder={config.configured?"Klucz zapisany · wpisz nowy, aby zastąpić":"Wklej klucz API"} value={key} onChange={e=>setKey(e.target.value)}/></label>
      <div className="field-grid"><label>Minimalna długość najnowszego filmu (sekundy)<input type="number" min={1} max={3600} value={config.minimumDurationSeconds} onChange={e=>setConfig({...config,minimumDurationSeconds:Number(e.target.value)})}/></label><label>Liczba wyników wyszukiwania<select value={config.maxResults} onChange={e=>setConfig({...config,maxResults:Number(e.target.value)})}>{[3,4,5].map(n=><option key={n}>{n}</option>)}</select></label></div>
      <label className="switch-row"><input type="checkbox" checked={config.autoNext} onChange={e=>setConfig({...config,autoNext:e.target.checked})}/> Po zakończeniu odtwórz następny film z wyników</label>
      <p>Domyślnie pomijamy filmy do 180 sekund. To filtr długości, a nie pewne rozpoznawanie Shorts.</p>
      <div className="button-row"><button disabled={busy} onClick={()=>void run(async()=>{await api.youtube.save({...config,apiKey:key||undefined});setKey("");})}>Zapisz konfigurację</button><button disabled={busy||!config.configured} onClick={()=>void run(()=>api.youtube.test())}>Test API</button><button disabled={busy} onClick={()=>void run(()=>api.youtube.clearCache())}>Wyczyść cache</button><button disabled={busy||!config.configured} onClick={()=>void run(()=>api.youtube.save({...config,clearKey:true}))}>Usuń klucz</button></div>
      <p role="status">{status}</p><p>Klucz: {config.configured?"zapisany":"brak"} · Wywołania API od restartu: {config.apiCallsSinceRestart}</p>{config.lastError&&<p role="alert">{config.lastError}</p>}<p>Limit pozostały: sprawdź w Google Cloud Console. Data API nie udostępnia go w odpowiedzi.</p>
    </section>
    <section className="admin-card admin-form"><h2>Znane kanały i aliasy</h2><p>Zapisane kanały używają playlisty uploads bez ponownego wyszukiwania nazwy.</p><form onSubmit={e=>{e.preventDefault();void run(()=>add(channel));}}><label>Kanał: @handle, URL, channelId lub nazwa<input value={channel} maxLength={200} onChange={e=>setChannel(e.target.value)}/></label><button disabled={busy||!channel.trim()}>Dodaj kanał</button></form>
      {candidates.length>0&&<div><p>Wybierz właściwy kanał:</p>{candidates.map(c=><button key={c.channelId} onClick={()=>void run(()=>add(c.channelId))}>{c.canonicalName}</button>)}</div>}
      {config.channels.map(c=><article key={c.channelId}><h3>{c.canonicalName}</h3><small>{c.channelId}</small><label>Aliasy (oddziel przecinkami)<input value={aliasDraft[c.channelId] ?? c.aliases.join(", ")} onChange={e=>setAliasDraft({...aliasDraft,[c.channelId]:e.target.value})}/></label><div className="button-row"><button disabled={busy} onClick={()=>void run(()=>api.youtube.channels(config.channels.map(item=>({...item,aliases:(aliasDraft[item.channelId] ?? item.aliases.join(",")).split(",").map(s=>s.trim()).filter(Boolean)}))))}>Zapisz aliasy</button><button disabled={busy} onClick={()=>void run(()=>api.youtube.channels(config.channels.filter(item=>item.channelId!==c.channelId)))}>Usuń kanał</button><button disabled={busy||!config.enabled} onClick={()=>void run(()=>api.youtube.latest(c.channelId))}>Odtwórz najnowszy</button></div></article>)}
    </section>
    <section className="admin-card"><h2>Warunki YouTube</h2><p>Korzystanie z tej funkcji podlega <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">Warunkom YouTube</a> i <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Polityce prywatności Google</a>. Film odtwarza oficjalny player; WallDeck nie pobiera materiałów ani nie usuwa reklam.</p></section>
  </div>;
}
