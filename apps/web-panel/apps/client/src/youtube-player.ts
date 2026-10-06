import type { YoutubeVideo, YoutubeReport } from "@walldeck/contracts";
import { mediaSurface } from "./media-surface";

type Player = { loadVideoById(id: string): void; playVideo(): void; pauseVideo(): void; stopVideo(): void; seekTo(seconds: number, allow: boolean): void; getCurrentTime(): number; getVolume(): number; setVolume(value: number): void; getPlayerState(): number; destroy(): void };
export type YoutubePlayer = Player;
let player: Player | null = null;
let video: YoutubeVideo | null = null;
let sessionId = "";
let unregister: (()=>void) | null = null;
let firstState: ((report:YoutubeReport)=>void) | null = null;
let baseVolume = 70;
let ducked = false;
let blocked = false;
let stopped = false;
let stoppedPosition = 0;
let lastError: string | null = null;
let onChange: (state: YoutubeReport) => void = () => undefined;
let readyWaiters: Array<(player: Player) => void> = [];
export function attachYoutubePlayer(next: Player, changed: typeof onChange) { player=next; onChange=changed; unregister=mediaSurface.register("youtube", {pause:()=>{controlYoutube("pause");},stop:stopYoutubeForSpotify,duck:duckYoutube}); readyWaiters.splice(0).forEach(resolve=>resolve(next)); }
export function detachYoutubePlayer() { unregister?.(); unregister=null; firstState?.(youtubeSnapshot("stopped")!); firstState=null; player=null; video=null; onChange=()=>undefined; }
const ready = () => player ? Promise.resolve(player) : new Promise<Player>((resolve,reject) => {
  const done = (p:Player) => { clearTimeout(timer); resolve(p); };
  const timer=setTimeout(()=>{ readyWaiters=readyWaiters.filter(fn=>fn!==done); reject(new Error("Player YouTube nie jest gotowy. Sprawdź połączenie.")); },10000);
  readyWaiters.push(done);
});
export function youtubeSnapshot(status?: YoutubeReport["status"]): YoutubeReport | null {
  if (!video || !player) return null;
  const code=player.getPlayerState();
  if(!ducked) baseVolume=Math.min(100,Math.max(0,player.getVolume()));
  return { sessionId, videoId:video.videoId, positionSeconds:stopped ? stoppedPosition : Math.max(0,player.getCurrentTime()||0), playing:!stopped && code===1, volume:baseVolume, status:stopped ? "stopped" : status ?? (lastError ? "error" : blocked ? "blocked" : code===1 ? "playing" : code===0 ? "ended" : code===2 ? "paused" : "loading"), error:lastError };
}
export function youtubePlayerChanged(status?: YoutubeReport["status"], error: string | null = null) { if(status==="blocked") blocked=true; if(status==="playing") blocked=false; lastError=error; const state=youtubeSnapshot(status); if(state) { onChange(state); if(["playing","blocked","error","stopped"].includes(state.status)) { firstState?.(state); firstState=null; } } }
export async function playYoutube(selected: YoutubeVideo, volume: number, session: string) {
  await mediaSurface.activate("youtube");
  const p=await ready(); video=selected; sessionId=session; baseVolume=volume; blocked=false; stopped=false; lastError=null;
  const settled=new Promise<YoutubeReport|null>(resolve=>{const timer=setTimeout(()=>{firstState=null;resolve(youtubeSnapshot());},8000);firstState=report=>{clearTimeout(timer);resolve(report);};});
  p.setVolume(ducked ? Math.min(20,baseVolume) : baseVolume); p.loadVideoById(selected.videoId);
  youtubePlayerChanged("loading");
  return { accepted:true, report: await settled };
}
export function controlYoutube(action: string, value?: number) {
  if(!player || !video) { if(action==="stop" || action==="returnView") return {status:"stopped"}; throw new Error("YouTube nie odtwarza filmu"); }
  if(action==="pause") player.pauseVideo();
  else if(action==="resume") { blocked=false; stopped=false; player.playVideo(); }
  else if(action==="stop" || action==="returnView") { stoppedPosition=player.getCurrentTime()||0; stopped=true; player.stopVideo(); youtubePlayerChanged("stopped"); }
  else if(action==="seek" || action==="seekBy" || action==="restart") player.seekTo(Math.max(0,Math.min(video.durationSeconds, action==="restart" ? 0 : action==="seekBy" ? player.getCurrentTime()+(value??0) : value??0)),true);
  else if(action==="volume") { baseVolume=Math.min(100,Math.max(0,value??70)); player.setVolume(ducked?Math.min(20,baseVolume):baseVolume); }
  else throw new Error("Nieznana komenda YouTube");
  return { accepted:true };
}
export function duckYoutube(active: boolean) {
  if(active && !ducked && player) baseVolume=player.getVolume();
  ducked=active; player?.setVolume(active ? Math.min(20,baseVolume) : baseVolume);
}
// All Spotify starts (including UI buttons) stop the web provider first.
export function stopYoutubeForSpotify() { if(player && video) { stoppedPosition=player.getCurrentTime()||0; stopped=true; player.stopVideo(); youtubePlayerChanged("stopped"); } }

let apiPromise: Promise<any> | null = null;
export function loadYoutubeApi(): Promise<any> {
  const win=window as any;
  if(win.YT?.Player) return Promise.resolve(win.YT);
  if(apiPromise) return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
    const previous=win.onYouTubeIframeAPIReady;
    const timeout=setTimeout(()=>{ apiPromise=null; reject(new Error("Nie można załadować YouTube. Sprawdź dostęp do internetu.")); },10000);
    win.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);previous?.();resolve(win.YT);};
    const script=document.createElement("script"); script.src="https://www.youtube.com/iframe_api";
    script.onerror=()=>{clearTimeout(timeout);apiPromise=null;script.remove();reject(new Error("YouTube jest niedostępny"));};
    document.head.append(script);
  });
  return apiPromise;
}
