import { useEffect, useReducer, useState } from "react";
import { AssistantFace } from "../assistant/AssistantFace";
import { ExpressiveAssistantFace } from "../assistant/ExpressiveAssistantFace";
import { assistantStates, assistantTransition, stateLabels, transientDelay } from "../assistant/assistant-state";

export function AssistantDemoView({ expressive = false }: { expressive?: boolean }) {
  const Face = expressive ? ExpressiveAssistantFace : AssistantFace;
  const [state, dispatch] = useReducer(assistantTransition, "idle");
  const [audio, setAudio] = useState(.35);
  const [simulate, setSimulate] = useState(false);
  const [simulatedAudio, setSimulatedAudio] = useState(0);
  const [controls, setControls] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [accent, setAccent] = useState("#37f3f3");
  useEffect(() => {
    const delay = transientDelay[state];
    if (!delay) return;
    const timer = setTimeout(() => dispatch({ type: "timeout" }), delay);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    if (!simulate || state !== "speaking") return;
    const started = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - started) / 1000;
      setSimulatedAudio(Math.sin(t * 1.4) > -.5 ? Math.abs(Math.sin(t * 9) * Math.cos(t * 3.1)) * .9 : 0);
    }, 65);
    return () => clearInterval(timer);
  }, [simulate, state]);
  return <section className="assistant-demo" aria-label="Asystent demo">
    <Face state={state} audioLevel={simulate ? simulatedAudio : audio} accentColor={accent} reducedMotion={reduced} />
    <button className="assistant-controls-toggle" aria-expanded={controls} onClick={() => setControls(!controls)}>{controls ? "Ukryj sterowanie ↘" : "Mimika ↗"}</button>
    {controls && <aside className="assistant-console" aria-label="Sterowanie demonstracją">
      <header><span>WALLDECK / {expressive ? "EKSPRESYJNY" : "SPOKOJNY"}</span><strong>{stateLabels[state]}</strong><small>Demo · bez mikrofonu</small></header>
      <div className="assistant-states">{assistantStates.map((value) => <button key={value} aria-pressed={state === value} onClick={() => dispatch({ type: "select", state: value })}>{stateLabels[value]}</button>)}</div>
      <div className="assistant-options">
        <label className="assistant-audio">Otwarcie ust <output>{Math.round((simulate ? simulatedAudio : audio) * 100)}%</output><input aria-label="Poziom audio" type="range" min="0" max="1" step="0.01" value={audio} disabled={simulate} onChange={(e) => { setAudio(Number(e.target.value)); dispatch({ type: "select", state: "speaking" }); }} /></label>
        <label><input type="checkbox" checked={simulate} onChange={(e) => { setSimulate(e.target.checked); dispatch({ type: "select", state: "speaking" }); }} />Symuluj mowę</label>
        <label><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />Spokojny ruch</label>
        <label>Akcent<input aria-label="Kolor twarzy" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} /></label>
      </div>
    </aside>}
  </section>;
}

export function ExpressiveAssistantDemoView() { return <AssistantDemoView expressive />; }
