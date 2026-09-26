import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { musicController as music } from "../music/controller";
import "./music-volume.css";
export function MusicVolume({ available }: { available: boolean }) {
 const [open,setOpen]=useState(false);
 const [value,setValue]=useState<number|null>(null);
 const [error,setError]=useState("");
 const current=useRef(0);const restore=useRef(.3);
 const pending=useRef<number|null>(null);const writing=useRef(false);const alive=useRef(true);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const reduced=useReducedMotion();
 const close=()=>{setOpen(false);if(timer.current)clearTimeout(timer.current)};
 const touch=()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setOpen(false),6000)};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(timer.current)clearTimeout(timer.current)}},[]);
 useEffect(()=>{
  if(!open)return;
  let disposed=false;
  const refresh=async()=>{try{const state=await music.getAudioOutputState();if(!disposed&&!writing.current){current.current=state.volume;setValue(state.volume);if(state.volume>0)restore.current=state.volume;setError("")}}catch{if(!disposed)setError("Nie można odczytać głośności tabletu.")}};
  void refresh();touch();const interval=setInterval(refresh,1500);
  return()=>{disposed=true;clearInterval(interval);if(timer.current)clearTimeout(timer.current)};
 },[open]);
 const change=async(next:number)=>{
  next=Math.min(1,Math.max(0,next));current.current=next;setValue(next);if(next>0)restore.current=next;
  pending.current=next;touch();if(writing.current)return;writing.current=true;
  try{while(pending.current!==null){const target=pending.current;pending.current=null;await music.setVolume(target)}
   const actual=await music.getAudioOutputState();if(alive.current&&pending.current===null){current.current=actual.volume;setValue(actual.volume);setError("")}
  }catch{pending.current=null;if(alive.current)setError("Nie udało się zmienić głośności.")}
  finally{writing.current=false;if(pending.current!==null&&alive.current)void change(pending.current)}
 };
 return <div className="music-volume">
 <button className="music-volume-trigger" disabled={!available} aria-label="Głośność tabletu" aria-expanded={open} onClick={()=>setOpen(!open)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8q5 4 0 8M19 5q7 7 0 14"/></svg><span>Głośność</span></button>
 <AnimatePresence>{open&&<motion.div className="music-volume-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.18}} onClick={close}>
 <section role="dialog" aria-modal="true" aria-label="Głośność tabletu" className="music-volume-popup" onClick={e=>e.stopPropagation()} onPointerDown={()=>{if(timer.current)clearTimeout(timer.current)}} onPointerUp={touch} onKeyDown={e=>{touch();if(e.key==="Escape")close();if(e.key==="Tab"){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus()}}}}>
 <header><div><small>DŹWIĘK TABLETU</small><h2>Głośność <output>{value===null?"—":Math.round(value*100)+"%"}</output></h2></div><button autoFocus onClick={close} aria-label="Zamknij głośność">×</button></header>
 <div className="music-volume-slider"><button disabled={value===null} aria-label="Ciszej" onClick={()=>void change(current.current-.05)}>−</button><input disabled={value===null} aria-label="Poziom głośności tabletu" type="range" min="0" max="100" value={Math.round((value??0)*100)} onChange={e=>void change(Number(e.target.value)/100)}/><button disabled={value===null} aria-label="Głośniej" onClick={()=>void change(current.current+.05)}>+</button></div>
 <button className="music-volume-mute" disabled={value===null} aria-pressed={value===0} onClick={()=>void change(current.current===0?restore.current:0)}>{value===0?"Przywróć dźwięk":"Wycisz"}</button>
 <p>Tablet i podłączone audio · nie zmienia głośności innych odtwarzaczy Spotify Connect.</p>{error&&<p role="alert">{error}</p>}
 </section></motion.div>}</AnimatePresence></div>;
}
