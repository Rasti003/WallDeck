import { useContext, useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AudioOutputState } from "@walldeck/contracts";
import { PanelContext } from "../panel-context";
import { api } from "../api";
import { nativeBridge } from "../native";
import { emptyMusicState, musicController as music, playbackPosition } from "../music/controller";
import { musicErrorMessage } from "../music/errors";
import "./music.css";

const time = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const connectionLabels = { disconnected: "Rozłączono", connecting: "Łączenie…", connected: "Połączono", error: "Połączenie wymaga uwagi" };

export function MusicView() {
  const { settings } = useContext(PanelContext);
  const [state, setState] = useState(emptyMusicState);
  const [output, setOutput] = useState<AudioOutputState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"audio" | "queue" | "playlists" | null>(null);
  const [seek, setSeek] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [accent, setAccent] = useState("43, 85, 71");
  const reducedMotion = useReducedMotion();
  const available = nativeBridge.available;
  const connected = state.connection === "connected";
  const ready = connected && Boolean(state.track) && !busy;
  const position = seek ?? playbackPosition(state, now);

  useEffect(() => {
    if (!available) return;
    let disposed = false;
    const unsubscribe = music.subscribePlaybackState(next => { if (!disposed) setState(next); });
    const refresh = () => {
      music.getPlaybackState().then(next => { if (!disposed) setState(next); }).catch(() => { if (!disposed) setMessage("Zaktualizuj aplikację WallDeck na tablecie."); });
      music.getAudioOutputState().then(next => { if (!disposed) setOutput(next); }).catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => { disposed = true; unsubscribe(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [available]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSeek(null);
    setAccent("43, 85, 71");
    if (!state.artwork) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      setAccent(`${r}, ${g}, ${b}`);
    };
    image.src = state.artwork;
    return () => { cancelled = true; };
  }, [state.artwork, state.track?.uri]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await action(); }
    catch { setMessage("Nie udało się wykonać polecenia. Sprawdź połączenie ze Spotify i spróbuj ponownie."); }
    finally { setBusy(false); }
  }

  async function home() {
    await api.activateView("ha");
    if (location.pathname.startsWith("/music")) location.assign("/panel");
  }

  return (
    <main className="music-view" style={{ "--music-accent": accent } as CSSProperties}>
      <div className="music-ambient" aria-hidden="true" />
      <header className="music-header">
        <button className="music-home" onClick={() => void run(home)}>⌂ <span>Home</span></button>
        <div className="music-brand"><span>WALLDECK</span><strong>Music</strong></div>
        <span className={`music-connection ${connected ? "is-connected" : ""}`}><i />Spotify · {available ? connectionLabels[state.connection] : "Podgląd w przeglądarce"}</span>
      </header>

      <div className="music-layout">
        <section className="music-art" aria-label="Okładka albumu">
          <AnimatePresence mode="wait">
            <motion.div key={state.track?.uri ?? "empty"} className="music-cover" initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .45 }}>
              {state.artwork ? <img src={state.artwork} alt={state.track?.album || "Okładka"} /> : <div className="music-cover-empty"><span>♫</span><small>Twoja muzyka.<br />Twoja przestrzeń.</small></div>}
            </motion.div>
          </AnimatePresence>
          <span className="music-provider">Spotify</span>
        </section>

        <section className="music-now" aria-label="Teraz odtwarzane">
          <p className="music-eyebrow">{state.context || "TERAZ ODTWARZANE"}</p>
          <AnimatePresence mode="wait">
            <motion.div key={state.track?.uri ?? "welcome"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .25 }}>
              <h1>{state.track?.title || "Włącz swój rytm"}</h1>
              <p className="music-artist">{state.track?.artist || "Spotify na Twoim WallDecku"}</p>
              <p className="music-album">{state.track?.album || "Muzyka zostaje z Tobą, gdy zmieniasz widok."}</p>
            </motion.div>
          </AnimatePresence>

          {!connected && <div className="music-onboarding">
            <p>{!available ? "Odtwarzaniem steruje aplikacja WallDeck na tablecie." : !settings.music.clientId ? "Dodaj Client ID Spotify w panelu administratora → Music." : !state.installed ? "Zainstaluj Spotify na tablecie i zaloguj się." : "Połącz swoje Spotify. Pierwsze połączenie wymaga potwierdzenia w aplikacji Spotify."}</p>
            {available && settings.music.clientId && <button className="music-connect" disabled={busy || state.connection === "connecting" || !state.installed} onClick={() => void run(async () => setState(await music.connect(settings.music.clientId, true)))}>{state.connection === "connecting" ? "Czekam na Spotify…" : "Połącz ze Spotify"}</button>}
          </div>}
          {connected && !state.track && <p className="music-hint">Uruchom pierwszy utwór w Spotify, a sterowanie pojawi się tutaj.</p>}
          <div className="music-progress">
            <input aria-label="Pozycja utworu" type="range" min="0" max={Math.max(1, state.track?.durationMs ?? 1)} value={position} disabled={!ready || !state.capabilities.seek}
              onChange={event => setSeek(Number(event.target.value))}
              onPointerUp={() => { if (seek !== null) { void run(() => music.seekTo(Math.round(seek))); setSeek(null); } }}
              onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && seek !== null) { void run(() => music.seekTo(Math.round(seek))); setSeek(null); } }} />
            <div><span>{time(position)}</span><span>{time(state.track?.durationMs ?? 0)}</span></div>
          </div>
          <div className="music-controls">
            <button aria-label="Losowanie" aria-pressed={state.shuffle} disabled={!ready || !state.capabilities.shuffle} onClick={() => void run(() => music.setShuffle(!state.shuffle))}>⤨</button>
            <button aria-label="Poprzedni utwór" disabled={!ready || !state.capabilities.previous} onClick={() => void run(music.previous)}>⏮</button>
            <motion.button className="music-play" aria-label={state.paused ? "Odtwórz" : "Pauza"} disabled={!connected || busy} whileTap={reducedMotion ? undefined : { scale: .94 }} onClick={() => void run(state.paused ? music.play : music.pause)}>
              <motion.span key={String(state.paused)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{state.paused ? "▶" : "Ⅱ"}</motion.span>
            </motion.button>
            <button aria-label="Następny utwór" disabled={!ready || !state.capabilities.next} onClick={() => void run(music.next)}>⏭</button>
            <button aria-label="Powtarzanie" aria-pressed={state.repeat !== 0} disabled={!ready || !state.capabilities.repeatContext} onClick={() => void run(() => music.setRepeat(state.repeat === 0 ? 1 : state.repeat === 1 && state.capabilities.repeatTrack ? 2 : 0))}>{state.repeat === 2 ? "↻¹" : "↻"}</button>
          </div>
          <button className="music-output" disabled={!available} onClick={() => setSheet("audio")}><span>◖))</span><div><strong>Wyjście audio</strong><small>{output?.bluetoothAvailable ? "Bluetooth dostępny · sprawdź wyjście w systemie" : "Głośność i urządzenia tabletu"}</small></div><span>›</span></button>
          {(message || state.error) && <p className="music-error" role="status">{message || musicErrorMessage(state.error)}</p>}
        </section>

        <aside className="music-next">
          <div><p className="music-eyebrow">DALEJ</p><h2>Up next</h2></div>
          <div className="music-queue-empty"><span>≡</span><strong>Kolejka jest w Spotify</strong><p>Podgląd kolejnych utworów wymaga dodatkowego połączenia z kontem. Obecna integracja go nie udostępnia.</p></div>
          <nav><button onClick={() => setSheet("queue")}>Kolejka <span>↗</span></button><button onClick={() => setSheet("playlists")}>Playlisty <span>↗</span></button></nav>
        </aside>
      </div>

      <AnimatePresence>
        {sheet && <motion.div className="music-sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheet(null)}>
          <motion.section className="music-sheet" role="dialog" aria-modal="true" aria-label={sheet === "audio" ? "Wyjście audio" : sheet === "queue" ? "Kolejka" : "Playlisty"} initial={{ y: reducedMotion ? 0 : 40 }} animate={{ y: 0 }} onClick={event => event.stopPropagation()}>
            <button className="music-sheet-close" autoFocus onClick={() => setSheet(null)} aria-label="Zamknij">×</button>
            <p className="music-eyebrow">MUSIC</p><h2>{sheet === "audio" ? "Wyjście audio" : sheet === "queue" ? "Kolejka Spotify" : "Twoje playlisty"}</h2>
            {sheet === "audio" ? <>
              <p>Android zarządza dźwiękiem Spotify. Lista pokazuje dostępne wyjścia; aktywnej trasy Spotify nie można wiarygodnie odczytać.</p>
              <ul>{output?.outputs.map(device => <li key={device.id}><strong>{device.name}</strong><span>{device.bluetooth ? "Bluetooth" : "Android audio"}</span></li>)}</ul>
              <label>Głośność multimediów · {Math.round((volume ?? output?.volume ?? 0) * 100)}%
                <input aria-label="Głośność multimediów" type="range" min="0" max="100" value={Math.round((volume ?? output?.volume ?? 0) * 100)} onChange={event => setVolume(Number(event.target.value) / 100)} onPointerUp={() => { if (volume !== null) void run(async () => { await music.setVolume(volume); setOutput(await music.getAudioOutputState()); setVolume(null); }); }} onKeyUp={() => { if (volume !== null) void run(async () => { await music.setVolume(volume); setOutput(await music.getAudioOutputState()); setVolume(null); }); }} />
              </label>
              <button className="music-connect" onClick={() => void run(music.openSystemOutputPicker)}>Otwórz ustawienia Bluetooth</button>
              <small>Kodek i Audio Focus Spotify: niedostępne do odczytu. WallDeck nie przejmuje dźwięku ani mikrofonu.</small>
            </> : <p>{sheet === "queue" ? "Spotify App Remote pozwala sterować odtwarzaniem, ale nie zwraca prawdziwej kolejki. Podgląd dodamy z osobną autoryzacją Spotify Web API." : "Przeglądanie playlist jest kolejnym etapem integracji. Na razie wybierz playlistę w Spotify, a potem steruj nią tutaj."}</p>}
          </motion.section>
        </motion.div>}
      </AnimatePresence>
    </main>
  );
}
