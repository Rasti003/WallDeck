import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { clampAudio, mouthOpening, stateLabels, type calmStates } from "./assistant-state";
type AssistantState = typeof calmStates[number];
import "./assistant.css";

type Props = { state: AssistantState; audioLevel?: number; accentColor?: string; reducedMotion?: boolean };
const poses: Record<AssistantState, { eye: number; pupil: number; x: number; y: number; brow: number; smile: number }> = {
  idle: { eye: 1, pupil: 1, x: 0, y: 0, brow: -3, smile: 17 },
  attention: { eye: 1.15, pupil: 1.08, x: 0, y: 0, brow: -10, smile: 7 },
  listening: { eye: 1.07, pupil: 1.14, x: 0, y: 0, brow: -6, smile: 4 },
  thinking: { eye: .87, pupil: .92, x: 22, y: -13, brow: -13, smile: 7 },
  speaking: { eye: .98, pupil: 1, x: 0, y: 0, brow: -3, smile: 12 },
  success: { eye: .64, pupil: 1.07, x: 0, y: -5, brow: -9, smile: 34 },
  error: { eye: .83, pupil: .9, x: -9, y: 4, brow: 13, smile: -12 },
  sleep: { eye: .045, pupil: .7, x: 0, y: 0, brow: 2, smile: 7 },
};

function useMicroMotion(enabled: boolean) {
  const [blink, setBlink] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) { setBlink(false); setGaze({ x: 0, y: 0 }); return; }
    let timer: ReturnType<typeof setTimeout>;
    let release: ReturnType<typeof setTimeout>;
    let look: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => { timer = setTimeout(() => {
      setBlink(true);
      release = setTimeout(() => { setBlink(false); scheduleBlink(); }, 140);
    }, 3500 + Math.random() * 8500); };
    const scheduleLook = () => { look = setTimeout(() => {
      setGaze({ x: (Math.random() - .5) * 16, y: (Math.random() - .5) * 9 });
      scheduleLook();
    }, 2600 + Math.random() * 4500); };
    scheduleBlink(); scheduleLook();
    return () => { clearTimeout(timer); clearTimeout(release); clearTimeout(look); };
  }, [enabled]);
  return { blink, gaze };
}

function Eye({ x, side, state, blink, gaze, reduced }: { x: number; side: number; state: AssistantState; blink: boolean; gaze: { x: number; y: number }; reduced: boolean }) {
  const clip = useId();
  const pose = poses[state];
  const asymmetry = state === "thinking" || state === "error";
  return <g transform={`translate(${x} 273)`}>
    <motion.path d="M -116 -104 Q 0 -137 116 -107" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"
      animate={{ y: pose.brow + (asymmetry ? side * 9 : side * 2), rotate: asymmetry ? side * 7 : side * 2, opacity: state === "sleep" ? .24 : .62 }} transition={{ duration: reduced ? 0 : .55 }} />
    <motion.g animate={{ scaleY: blink ? .035 : pose.eye * (asymmetry && side === -1 ? .89 : 1) }} style={{ transformOrigin: "0px 0px" }} transition={{ duration: reduced ? 0 : blink ? .09 : .38 }}>
      <defs><clipPath id={clip}><rect x="-125" y="-76" width="250" height="152" rx="60" /></clipPath></defs>
      <rect x="-125" y="-76" width="250" height="152" rx="60" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="5" />
      <g clipPath={`url(#${clip})`}>
        <motion.g animate={{ x: pose.x + (state === "idle" ? gaze.x : 0), y: pose.y + (state === "idle" ? gaze.y : 0), scale: pose.pupil }} transition={{ type: "spring", stiffness: 75, damping: 19, duration: reduced ? 0 : undefined }}>
          <rect x="-53" y="-60" width="106" height="120" rx="39" fill="currentColor" />
          <rect x="-19" y="-33" width="38" height="68" rx="18" fill="#000" fillOpacity=".82" />
          <rect x="-33" y="-43" width="13" height="13" rx="4" fill="#000" fillOpacity=".4" />
        </motion.g>
      </g>
    </motion.g>
  </g>;
}

function Mouth({ state, audioLevel, reduced }: { state: AssistantState; audioLevel: number; reduced: boolean }) {
  const audio = useSpring(0, { stiffness: 170, damping: 25, mass: .65 });
  const smile = useSpring(poses[state].smile, { stiffness: 90, damping: 20 });
  useEffect(() => { audio.set(state === "speaking" ? clampAudio(audioLevel) : 0); smile.set(poses[state].smile); }, [audio, smile, audioLevel, state]);
  const path = useTransform(() => {
    const opening = mouthOpening(audio.get());
    const curve = smile.get();
    return `M -83 0 Q 0 ${curve - opening * .55} 83 0 Q 0 ${curve + opening * 1.55} -83 0 Z`;
  });
  return <g transform="translate(600 455)">
    <motion.path d={path} fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    <motion.path d="M -99 -4 l -5 10 M 99 -4 l 5 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" animate={{ opacity: state === "success" ? .7 : .15 }} transition={{ duration: reduced ? 0 : .4 }} />
  </g>;
}

export function AssistantFace({ state, audioLevel = 0, accentColor = "#37F3F3", reducedMotion = false }: Props) {
  const systemReduced = useReducedMotion();
  const reduced = reducedMotion || Boolean(systemReduced);
  const { blink, gaze } = useMicroMotion(!reduced && state !== "sleep");
  return <div className={`assistant-face ${reduced ? "is-reduced" : ""}`} data-state={state} style={{ "--assistant-accent": accentColor } as CSSProperties}>
    <svg viewBox="0 0 1200 650" role="img" aria-label={`Asystent: ${stateLabels[state]}`}>
      <motion.g animate={{ opacity: state === "sleep" ? .32 : 1 }} transition={{ duration: reduced ? 0 : 1 }}>
        <g className="assistant-breath">
          <Eye x={370} side={-1} {...{ state, blink, gaze, reduced }} />
          <Eye x={830} side={1} {...{ state, blink, gaze, reduced }} />
          <path d="M 591 351 Q 600 359 609 351" fill="none" stroke="currentColor" strokeWidth="4" opacity=".35" strokeLinecap="round" />
          <Mouth {...{ state, audioLevel, reduced }} />
          <g className="assistant-accents" opacity=".22" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
            <path d="M 212 355 h 20 M 212 367 h 11 M 968 355 h 20 M 977 367 h 11" />
          </g>
        </g>
      </motion.g>
    </svg>
  </div>;
}
