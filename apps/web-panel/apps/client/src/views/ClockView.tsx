import { useContext, useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ScheduledItem } from "@walldeck/contracts";
import { api } from "../api";
import { connectEvents } from "../events";
import { PanelContext } from "../panel-context";
import { playNotificationSound } from "../notification-sound";
import "./clock.css";

const days = [{ id: 1, short: "Pn" }, { id: 2, short: "Wt" }, { id: 3, short: "Śr" }, { id: 4, short: "Cz" }, { id: 5, short: "Pt" }, { id: 6, short: "So" }, { id: 0, short: "Nd" }];
const pad = (value: number) => String(value).padStart(2, "0");
const clock = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fullDate = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" });

function durationText(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours} godz. ${minutes ? `${minutes} min` : ""}` : `${minutes} min`;
}
function remainingText(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor(seconds % 3600 / 60); const rest = seconds % 60;
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}
function tomorrowDate() { const value = new Date(Date.now() + 86_400_000); return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; }

export function ClockView() {
  const { settings, setInteractionLocked } = useContext(PanelContext);
  const reduced = useReducedMotion();
  const [now, setNow] = useState(Date.now());
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [composer, setComposer] = useState<"timer" | "alarm" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [timerParts, setTimerParts] = useState({ hours: 0, minutes: 10, seconds: 0 });
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [alarmMode, setAlarmMode] = useState<"once" | "repeat">("repeat");
  const [alarmTime, setAlarmTime] = useState("08:00");
  const [alarmDate, setAlarmDate] = useState(tomorrowDate);
  const [repeatDays, setRepeatDays] = useState([1, 2, 3, 4, 5]);
  const ringing = items.filter(item => item.status === "ringing");
  const scheduled = items.filter(item => item.status === "scheduled");

  const refresh = () => api.schedules.list().then(result => setItems(result.items)).catch(error => setError(String(error)));
  useEffect(() => { void refresh(); const socket = connectEvents(event => { const message = JSON.parse(event.data) as { type?: string; items?: ScheduledItem[]; item?: ScheduledItem }; if (message.type === "schedules.changed" && message.items) setItems(message.items); if (message.type === "schedule.fired") void refresh(); }); return () => socket.close(); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!ringing.length) return;
    playNotificationSound("alarm", settings.notifications.volume);
    const timer = setInterval(() => playNotificationSound("alarm", settings.notifications.volume), 3_200);
    return () => clearInterval(timer);
  }, [ringing.map(item => item.id).join("|"), settings.notifications.volume]);
  useEffect(() => {
    setInteractionLocked(Boolean(composer || ringing.length));
    return () => setInteractionLocked(false);
  }, [composer, ringing.length, setInteractionLocked]);

  const date = new Date(now); const time = clock.format(date); const seconds = date.getSeconds();
  const next = scheduled[0];
  const focusedTimer = scheduled.find(item => item.kind === "timer");
  const remainingSchedules = focusedTimer ? scheduled.filter(item => item.id !== focusedTimer.id) : scheduled;
  const timerCount = scheduled.filter(item => item.kind === "timer").length;
  const alarmCount = scheduled.filter(item => item.kind === "alarm").length;
  const resetComposer = () => { setComposer(null); setLabel(""); setPrompt(""); setError(""); };

  async function createTimer(event: FormEvent) {
    event.preventDefault(); const durationSeconds = timerParts.hours * 3600 + timerParts.minutes * 60 + timerParts.seconds;
    if (!durationSeconds) return setError("Ustaw czas minutnika.");
    setBusy(true); setError("");
    try { await api.schedules.createTimer({ durationSeconds, label, automationPrompt: prompt }); await refresh(); resetComposer(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }
  async function createAlarm(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (alarmMode === "repeat") await api.schedules.createAlarm({ label, time: alarmTime, repeatDays, automationPrompt: prompt });
      else await api.schedules.createAlarm({ label, repeatDays: [], triggerAt: new Date(`${alarmDate}T${alarmTime}:00`).toISOString(), automationPrompt: prompt });
      await refresh(); resetComposer();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }
  const setQuickTimer = (minutes: number) => { setTimerParts({ hours: 0, minutes, seconds: 0 }); setComposer("timer"); };

  return <main className={`clock-view${focusedTimer ? " clock-view--timer" : ""}`} onPointerDown={event => event.stopPropagation()} onPointerUp={event => { event.stopPropagation(); window.dispatchEvent(new Event("wallpanel:userInteraction")); }}>
    <div className="clock-aurora" aria-hidden="true"><i /><i /><i /></div>
    <motion.header className="clock-hero" initial={reduced ? false : { opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }}>
      <div className="clock-brand"><span>WALLDECK</span><strong>Zegar</strong></div>
      <div className="clock-now">
        <motion.div className="clock-orbit" animate={reduced ? undefined : { rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }}><i style={{ transform: `rotate(${seconds * 6}deg)` }} /></motion.div>
        <time>{time}</time><p>{fullDate.format(date)}</p>
      </div>
      <div className="clock-next"><small>NASTĘPNE</small>{next ? <><strong>{next.label}</strong><span>{next.kind === "timer" ? remainingText(Date.parse(next.triggerAt) - now) : new Date(next.triggerAt).toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span></> : <><strong>Spokojny dzień</strong><span>Brak zaplanowanych alarmów</span></>}</div>
    </motion.header>

    <section className="clock-content">
      <motion.aside className="clock-create" initial={reduced ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .08 }}>
        <div><span className="clock-kicker">DODAJ</span><h1>Zaplanuj chwilę</h1><p>Minutnik na teraz albo budzik na później.</p></div>
        <button className="clock-primary" onClick={() => setComposer("timer")}><span>＋</span><b>Nowy minutnik</b><small>{timerCount} aktywne</small></button>
        <button className="clock-secondary" onClick={() => setComposer("alarm")}><span>◷</span><b>Nowy budzik</b><small>{alarmCount} zaplanowane</small></button>
        <div className="clock-presets"><small>SZYBKI START</small><div>{[5, 10, 15, 30].map(minutes => <button key={minutes} onClick={() => setQuickTimer(minutes)}>{minutes}<i>min</i></button>)}</div></div>
      </motion.aside>

      <section className="clock-schedules">
        <header><div><span className="clock-kicker">AKTYWNE</span><h2>Twój rytm</h2></div><strong>{scheduled.length}</strong></header>
        <AnimatePresence mode="popLayout">
          {!scheduled.length && <motion.div className="clock-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="clock-empty-orbit"><i /></div><h3>Nic Cię teraz nie pogania</h3><p>Dodaj minutnik albo zaplanuj pierwszy budzik.</p></motion.div>}
          {focusedTimer && <TimerFocus key={focusedTimer.id} item={focusedTimer} now={now} reduced={Boolean(reduced)} onRemove={() => void api.schedules.remove(focusedTimer.id).then(refresh)} />}
          {remainingSchedules.length > 0 && focusedTimer && <motion.div className="clock-stack-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>POZOSTAŁE</motion.div>}
          {remainingSchedules.map((item, index) => <ScheduleCard key={item.id} item={item} now={now} index={index} reduced={Boolean(reduced)} onRemove={() => void api.schedules.remove(item.id).then(refresh)} />)}
        </AnimatePresence>
      </section>
    </section>

    <AnimatePresence>{composer && <motion.div className="clock-sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={resetComposer}>
      <motion.form className="clock-sheet" initial={reduced ? false : { y: "100%", scale: .96 }} animate={{ y: 0, scale: 1 }} exit={{ y: "100%", scale: .97 }} transition={{ type: "spring", stiffness: 310, damping: 30 }} onClick={event => event.stopPropagation()} onSubmit={composer === "timer" ? createTimer : createAlarm}>
        <header><div><span className="clock-kicker">{composer === "timer" ? "MINUTNIK" : "BUDZIK"}</span><h2>{composer === "timer" ? "Odliczaj po swojemu" : "Dzień zaczyna się tutaj"}</h2></div><button type="button" aria-label="Zamknij" onClick={resetComposer}>×</button></header>
        {composer === "timer" ? <>
          <div className="clock-duration" aria-label="Czas minutnika">{(["hours", "minutes", "seconds"] as const).map((part, index) => <div key={part}><button type="button" onClick={() => setTimerParts(value => ({ ...value, [part]: Math.min(part === "hours" ? 48 : 59, value[part] + 1) }))}>＋</button><motion.output key={timerParts[part]} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>{pad(timerParts[part])}</motion.output><small>{part === "hours" ? "godz" : part === "minutes" ? "min" : "sek"}</small><button type="button" onClick={() => setTimerParts(value => ({ ...value, [part]: Math.max(0, value[part] - 1) }))}>−</button>{index < 2 && <b>:</b>}</div>)}</div>
          <div className="clock-inline-presets">{[1, 5, 10, 15, 30, 45].map(minutes => <button type="button" className={timerParts.hours === 0 && timerParts.minutes === minutes && timerParts.seconds === 0 ? "selected" : ""} onClick={() => setTimerParts({ hours: 0, minutes, seconds: 0 })} key={minutes}>{minutes} min</button>)}</div>
        </> : <>
          <label className="clock-time-input"><span>Godzina</span><input type="time" required value={alarmTime} onChange={event => setAlarmTime(event.target.value)} /></label>
          <div className="clock-mode"><button type="button" className={alarmMode === "repeat" ? "selected" : ""} onClick={() => setAlarmMode("repeat")}>Powtarzaj</button><button type="button" className={alarmMode === "once" ? "selected" : ""} onClick={() => setAlarmMode("once")}>Jeden raz</button></div>
          {alarmMode === "repeat" ? <div className="clock-days">{days.map(day => <button type="button" className={repeatDays.includes(day.id) ? "selected" : ""} aria-pressed={repeatDays.includes(day.id)} key={day.id} onClick={() => setRepeatDays(value => value.includes(day.id) ? value.filter(id => id !== day.id) : [...value, day.id])}>{day.short}</button>)}</div> : <label className="clock-date"><span>Data</span><input type="date" required value={alarmDate} min={new Date().toISOString().slice(0, 10)} onChange={event => setAlarmDate(event.target.value)} /></label>}
        </>}
        <label className="clock-field"><span>Etykieta <small>opcjonalnie</small></span><input maxLength={100} placeholder={composer === "timer" ? "np. Gotowanie makaronu" : "np. Pobudka do pracy"} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <details className="clock-ai"><summary><i>✦</i><span><strong>Po wybiciu zapytaj asystenta</strong><small>Opcjonalna instrukcja wykonana w chwili alarmu</small></span><b>＋</b></summary><label>Prompt dla asystenta<textarea rows={3} maxLength={1000} placeholder="np. Puść spokojną muzykę i opowiedz krótki kawał" value={prompt} onChange={event => setPrompt(event.target.value)} /></label></details>
        {error && <p className="clock-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={resetComposer}>Anuluj</button><button className="clock-save" disabled={busy || (composer === "alarm" && alarmMode === "repeat" && !repeatDays.length)}>{busy ? "Zapisuję…" : composer === "timer" ? "Uruchom minutnik" : "Zapisz budzik"}</button></footer>
      </motion.form>
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{ringing[0] && <Ringing item={ringing[0]} onDismiss={() => void api.schedules.dismiss(ringing[0].id).then(refresh)} onSnooze={() => void api.schedules.snooze(ringing[0].id, 10).then(refresh)} reduced={Boolean(reduced)} />}</AnimatePresence>
  </main>;
}

function TimerFocus({ item, now, reduced, onRemove }: { item: ScheduledItem; now: number; reduced: boolean; onRemove(): void }) {
  const remaining = Math.max(0, Date.parse(item.triggerAt) - now);
  const total = Math.max(1, (item.durationSeconds ?? 1) * 1000);
  const progress = Math.max(0, Math.min(1, remaining / total));
  const elapsedAngle = (1 - progress) * 360 - 90;
  return <motion.article layout className="clock-timer-focus" initial={reduced ? false : { opacity: 0, scale: .94, y: 22 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .9 }} transition={{ type: "spring", stiffness: 240, damping: 28 }}>
    <div className="clock-focus-ring" aria-label={`Pozostało ${remainingText(remaining)}`}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="clock-focus-track" cx="120" cy="120" r="106" pathLength="1" />
        <motion.circle className="clock-focus-progress" cx="120" cy="120" r="106" pathLength="1" initial={false} animate={{ pathLength: progress }} transition={{ duration: reduced ? 0 : .25, ease: "linear" }} />
      </svg>
      <div className="clock-focus-orbit" style={{ transform: `rotate(${elapsedAngle}deg)` }} aria-hidden="true"><i /></div>
      <div className="clock-focus-time"><small>POZOSTAŁO</small><strong>{remainingText(remaining)}</strong></div>
    </div>
    <div className="clock-focus-copy">
      <span className="clock-kicker">MINUTNIK W TOKU</span>
      <h3>{item.label}</h3>
      <p>Ustawiono na {durationText(item.durationSeconds ?? 0)}</p>
      {item.automationPrompt && <small>✦ Po zakończeniu odezwie się asystent</small>}
      <button onClick={onRemove}>Anuluj minutnik</button>
    </div>
  </motion.article>;
}

function ScheduleCard({ item, now, index, reduced, onRemove }: { item: ScheduledItem; now: number; index: number; reduced: boolean; onRemove(): void }) {
  const remaining = Date.parse(item.triggerAt) - now;
  const progress = item.kind === "timer" && item.durationSeconds ? Math.max(0, Math.min(1, remaining / (item.durationSeconds * 1000))) : 1;
  const repeat = item.repeatDays.length ? days.filter(day => item.repeatDays.includes(day.id)).map(day => day.short).join(" · ") : "Jeden raz";
  return <motion.article layout className={`clock-card clock-card--${item.kind}`} initial={reduced ? false : { opacity: 0, x: 30, scale: .97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: .92 }} transition={{ delay: reduced ? 0 : index * .045 }}>
    <div className="clock-card-icon">{item.kind === "timer" ? <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" /><motion.circle cx="22" cy="22" r="18" pathLength="1" style={{ pathLength: progress }} /></svg> : <span>◷</span>}</div>
    <div className="clock-card-copy"><small>{item.kind === "timer" ? "MINUTNIK" : repeat.toUpperCase()}</small><h3>{item.label}</h3>{item.automationPrompt && <span>✦ Asystent po alarmie</span>}</div>
    <div className="clock-card-time">{item.kind === "timer" ? <strong>{remainingText(remaining)}</strong> : <><strong>{item.time ?? new Date(item.triggerAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</strong><small>{item.repeatDays.length ? "" : new Date(item.triggerAt).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</small></>}</div>
    <button className="clock-remove" aria-label={`Usuń ${item.label}`} onClick={onRemove}>×</button>
  </motion.article>;
}

function Ringing({ item, onDismiss, onSnooze, reduced }: { item: ScheduledItem; onDismiss(): void; onSnooze(): void; reduced: boolean }) {
  return <motion.section className="clock-ringing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="clock-ringing-waves" aria-hidden="true">{[0, 1, 2].map(index => <motion.i key={index} animate={reduced ? undefined : { scale: [1, 1.65], opacity: [.35, 0] }} transition={{ duration: 2.3, repeat: Infinity, delay: index * .55, ease: "easeOut" }} />)}</div>
    <motion.div className="clock-ringing-bell" animate={reduced ? undefined : { rotate: [0, -10, 10, -7, 7, 0], y: [0, -5, 0] }} transition={{ duration: 1.1, repeat: Infinity, repeatDelay: .5 }}>◷</motion.div>
    <span>{item.kind === "timer" ? "MINUTNIK ZAKOŃCZONY" : "BUDZIK"}</span><h2>{item.label}</h2><time>{new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</time>
    {item.automationPrompt && <p><i>✦</i> Asystent wykonuje zapisane polecenie</p>}
    {item.automationResult && <p className="clock-automation-result">{item.automationResult}</p>}
    <div><button onClick={onSnooze}>Drzemka 10 min</button><button className="clock-dismiss" onClick={onDismiss}>Wyłącz alarm</button></div>
  </motion.section>;
}
