import { useContext, useEffect, useReducer, useState } from "react";
import { assistantStateSchema } from "@walldeck/contracts";
import { PanelContext } from "../panel-context";
import { nativeBridge } from "../native";
import { assistantBrightness } from "../assistant/brightness";
import { useIsPresent } from "motion/react";
import { ExpressiveAssistantFace } from "../assistant/ExpressiveAssistantFace";
import { assistantEntryState, assistantStates, assistantTransition, automaticSleepEntryDelay, stateLabels, transientDelay } from "../assistant/assistant-state";

export function AssistantDemoView() {
  const studio = location.pathname.startsWith("/assistant-expressive");
  const isPresent = useIsPresent();
  const { settings, activeView, requestedAssistantState } = useContext(PanelContext);
  const [state, dispatch] = useReducer(assistantTransition, "idle", () => assistantEntryState(requestedAssistantState, assistantStateSchema.safeParse(new URLSearchParams(location.search).get("state")).data ?? "idle"));
  const brightness = assistantBrightness(settings, state);
  useEffect(() => {
    if (isPresent && activeView === "assistant-expressive" && nativeBridge.available) {
      nativeBridge.call("brightness", { value: brightness }).catch(() => undefined);
    }
  }, [brightness, activeView, isPresent]);
  const [audio, setAudio] = useState(.35);
  const [simulate, setSimulate] = useState(false);
  const [simulatedAudio, setSimulatedAudio] = useState(0);
  const [controls, setControls] = useState(studio);
  const [reduced, setReduced] = useState(false);
  const [accent, setAccent] = useState("#37f3f3");
  useEffect(() => {
    const delay = transientDelay[state];
    if (!delay) return;
    const timer = setTimeout(() => dispatch({ type: "timeout" }), delay);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("walldeck:assistantStateChanged", { detail: { state } }));
  }, [state]);
  useEffect(() => {
    if (!requestedAssistantState) return;
    if (requestedAssistantState !== "sleep") {
      dispatch({ type: "select", state: requestedAssistantState });
      return;
    }
    dispatch({ type: "select", state: "idle" });
    const timer = setTimeout(() => dispatch({ type: "select", state: "sleep" }), automaticSleepEntryDelay);
    return () => clearTimeout(timer);
  }, [requestedAssistantState]);
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
    <ExpressiveAssistantFace state={!isPresent ? "sleep" : state} audioLevel={simulate ? simulatedAudio : audio} accentColor={accent} reducedMotion={reduced} />
    {studio && <button className="assistant-controls-toggle" aria-expanded={controls} onClick={() => setControls(!controls)}>{controls ? "Ukryj sterowanie ↘" : "Mimika ↗"}</button>}
    {studio && controls && <aside className="assistant-console" aria-label="Sterowanie demonstracją">
      <header><span>WALLDECK / ASYSTENT</span><strong>{stateLabels[state]}</strong><small>Demo · bez mikrofonu</small></header>
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
