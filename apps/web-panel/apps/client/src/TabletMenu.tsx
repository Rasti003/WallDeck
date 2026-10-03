import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ViewId } from "@walldeck/contracts";
import "./tablet-menu.css";
import { nativeBridge } from "./native";
export const menuLabels: Record<ViewId, string> = { photos: "Zdjęcia", ha: "Dom", timers: "Zegar", music: "Music", "assistant-expressive": "Asystent", "assistant-canvas": "Canvas" };
const icons: Record<ViewId, string> = { photos: "▧", ha: "⌂", timers: "◷", music: "♫", "assistant-expressive": "✦", "assistant-canvas": "◇" };
export function TabletMenu({ open, showHandle, current, views, onOpen, onClose, onSelect }: { open: boolean; showHandle: boolean; current: ViewId; views: ViewId[]; onOpen: () => void; onClose: () => void; onSelect: (v: ViewId) => void }) {
 const [exitAvailable, setExitAvailable] = useState(false);
 const [exitError, setExitError] = useState(false);
 useEffect(() => { if (nativeBridge.available) nativeBridge.call("capabilities").then(value => { const caps = value as { methods?: string[] }; setExitAvailable(caps.methods?.includes("exitToTablet") ?? false); }).catch(() => undefined); }, []);
 const reduced = useReducedMotion();
 const close = useRef<HTMLButtonElement>(null);
 useEffect(() => { if (open) close.current?.focus(); }, [open]);
 return <div className="tablet-menu-root" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
 {showHandle && <button className="tablet-menu-handle" aria-label="Otwórz menu widoków" aria-expanded={open} onClick={onOpen}><span /></button>}
 <AnimatePresence>{open && <motion.div className="tablet-menu-shade" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.2}} onClick={onClose}>
 <motion.section role="dialog" aria-modal="true" aria-label="Wybierz widok" className="tablet-menu-glass" initial={{y:reduced?0:-36,scale:.97}} animate={{y:0,scale:1}} exit={{y:reduced?0:-20}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape")onClose(); if(e.key==="Tab"){const buttons=Array.from(e.currentTarget.querySelectorAll('button'));if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0]?.focus()}}}}>
 <header><div><small>WALLDECK</small><h2>Twoja przestrzeń</h2></div><button ref={close} aria-label="Zamknij menu" onClick={onClose}>×</button></header>
 <nav aria-label="Widoki">{views.map(view=><button key={view} className={view===current?"selected":""} aria-current={view===current?"page":undefined} onClick={()=>onSelect(view)}><span aria-hidden="true">{icons[view]}</span><strong>{menuLabels[view]}</strong><i>{view===current?"Teraz":"Otwórz"}</i></button>)}</nav>
 <footer><p>Wybierz widok lub dotknij poza menu</p>{exitAvailable && <button className="tablet-menu-exit" aria-label="Tryb tabletu — wyjdź z WallDeck" title="Tryb tabletu" onClick={()=>{setExitError(false);void nativeBridge.call("exitToTablet").catch(()=>setExitError(true));}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M10 18h4"/></svg></button>}</footer>{exitError && <p role="alert">Nie udało się wyjść. Przytrzymaj przycisk ciszej przez 2 sekundy.</p>}
 </motion.section></motion.div>}</AnimatePresence></div>;
}
