import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { clampAudio, mouthOpening, stateLabels, type AssistantState } from "./assistant-state";
import "./assistant.css";

type Props = { state: AssistantState; audioLevel?: number; accentColor?: string; reducedMotion?: boolean };
const poses: Record<AssistantState, { eye: number; pupil: number; x: number; y: number; brow: number; smile: number }> = {
  idle: { eye: 1, pupil: 1, x: 0, y: 0, brow: -8, smile: 36 },
  attention: { eye: 1.15, pupil: 1.08, x: 0, y: 0, brow: -10, smile: 7 },
  listening: { eye: 1.07, pupil: 1.14, x: 0, y: 0, brow: -6, smile: 4 },
  thinking: { eye: .8, pupil: .92, x: 30, y: -20, brow: -20, smile: 10 },
  speaking: { eye: .98, pupil: 1, x: 0, y: 0, brow: -3, smile: 12 },
  success: { eye: .55, pupil: 1.07, x: 0, y: -5, brow: -19, smile: 66 },
  error: { eye: .75, pupil: .9, x: -20, y: 8, brow: 18, smile: -33 },
  sleep: { eye: .045, pupil: .7, x: 0, y: 0, brow: 2, smile: 7 },
  curious: { eye: 1.12, pupil: 1.12, x: 8, y: -5, brow: -22, smile: 22 },
  uncertain: { eye: .8, pupil: .9, x: -12, y: 5, brow: 10, smile: -18 },
  confirm: { eye: .85, pupil: 1, x: 0, y: 0, brow: -8, smile: 38 },
  surprised: { eye: 1.28, pupil: .8, x: 0, y: 0, brow: -28, smile: 0 },
  wink: { eye: .95, pupil: 1, x: 8, y: 0, brow: -12, smile: 46 },
  laughing: { eye: .33, pupil: 1.1, x: 0, y: -8, brow: -20, smile: 75 },
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
      setGaze(Math.random() < .25 ? { x: 0, y: 0 } : { x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2 });
      scheduleLook();
    }, 1800 + Math.random() * 3200); };
    scheduleBlink(); scheduleLook();
    return () => { clearTimeout(timer); clearTimeout(release); clearTimeout(look); };
  }, [enabled]);
  return { blink, gaze };
}

function Eye({ x, side, state, blink, gaze, reduced }: { x: number; side: number; state: AssistantState; blink: boolean; gaze: { x: number; y: number }; reduced: boolean }) {
  const clip = useId();
  const pose = poses[state];
  const asymmetry = ["thinking", "error", "curious", "uncertain", "wink"].includes(state);
  return <g transform={`translate(${x} 273)`}>
    <motion.path fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round"
      animate={{ d: `M -116 ${-104 + side * (asymmetry ? 15 : 3)} Q 0 ${state === "success" ? -170 : state === "error" ? -95 : -145 - gaze.y * 12} 116 ${-104 - side * (asymmetry ? 15 : 3)}`, y: pose.brow + (asymmetry ? side * 18 : gaze.y * -9 + side * gaze.x * 9), rotate: asymmetry ? side * 12 : side * 3 + gaze.x * 5, opacity: state === "sleep" ? .24 : .85 }} transition={{ duration: reduced ? 0 : .65 }} />
    <motion.g initial={{ scaleY: reduced ? pose.eye : .035 }} animate={{ scaleY: blink || (state === "wink" && side === -1) ? .035 : pose.eye * (asymmetry && side === -1 ? .89 : 1) }} style={{ transformOrigin: "0px 0px" }} transition={{ duration: reduced ? 0 : blink ? .09 : .38 }}>
      <defs><clipPath id={clip}><rect x="-125" y="-76" width="250" height="152" rx="60" /></clipPath></defs>
      <rect x="-125" y="-76" width="250" height="152" rx="60" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeWidth="5" />
      <g clipPath={`url(#${clip})`}>
        <motion.g animate={{ x: pose.x + gaze.x * 32, y: pose.y + gaze.y * 18, scale: pose.pupil }} transition={{ duration: reduced ? 0 : .28 }}>
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
  useEffect(() => { audio.set(state === "speaking" ? clampAudio(audioLevel) : state === "laughing" ? .72 : state === "surprised" ? .8 : 0); smile.set(poses[state].smile); }, [audio, smile, audioLevel, state]);
  useEffect(() => {
    if (state !== "laughing" || reduced) return;
    let beat = 0;
    const timer = setInterval(() => audio.set([.8, .3, .65, .15, .8, .5, .18][beat++ % 7]), 190);
    return () => clearInterval(timer);
  }, [audio, state, reduced]);
  const path = useTransform(() => {
    const opening = mouthOpening(audio.get()) * 1.55;
    const curve = smile.get();
    const width = state === "surprised" ? 40 : 102 - opening * .27 + Math.max(0, curve) * .25;
    const skew = state === "thinking" || state === "wink" ? 16 : state === "error" || state === "uncertain" ? -12 : 0;
    return `M ${-width} ${skew} Q 0 ${curve - opening * .7} ${width} ${-skew} Q 0 ${curve + opening * 1.5} ${-width} ${skew} Z`;
  });
  return <g transform="translate(600 455)">
    <motion.path d={path} fill="currentColor" fillOpacity=".32" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <motion.path d="M -99 -4 l -5 10 M 99 -4 l 5 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" animate={{ opacity: state === "success" ? .7 : .15 }} transition={{ duration: reduced ? 0 : .4 }} />
  </g>;
}

export function ExpressiveAssistantFace({ state, audioLevel = 0, accentColor = "#37F3F3", reducedMotion = false }: Props) {
  const systemReduced = useReducedMotion();
  const reduced = reducedMotion || Boolean(systemReduced);
  const { blink, gaze } = useMicroMotion(!reduced && state !== "sleep");
  const looking = state === "idle" ? gaze : state === "thinking" ? { x: .65, y: -.6 } : state === "error" ? { x: -.3, y: .2 } : { x: 0, y: 0 };
  const head = reduced || state === "sleep" ? { x: 0, y: 0 } : looking;
  return <div className={`assistant-face ${reduced ? "is-reduced" : ""}`} data-variant="expressive" data-state={state} style={{ "--assistant-accent": accentColor } as CSSProperties}>
    <svg viewBox="0 0 1200 650" role="img" aria-label={`Asystent: ${stateLabels[state]}`}>
      <motion.g style={{ transformOrigin: "600px 325px" }} initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : .82, y: reduced ? 0 : 45 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: reduced ? 0 : .9, ease: [.16, 1, .3, 1] }}>
      <motion.g animate={{ opacity: state === "sleep" ? .32 : 1 }} transition={{ duration: reduced ? 0 : 1 }}>
        <g className="assistant-breath"><g className="assistant-reaction">
        <motion.g className="assistant-virtual-head" style={{ transformOrigin: "600px 325px" }} animate={{ x: head.x * 125, y: head.y * 55, rotate: head.x * 5, scaleX: 1 - Math.abs(head.x) * .07, scaleY: 1 - Math.abs(head.y) * .025 }} transition={{ duration: reduced ? 0 : 1.15, ease: [.22, 1, .36, 1] }}>
          <motion.g animate={{ x: head.x * 22, scale: 1 + head.x * .06 }} style={{ transformOrigin: "370px 273px" }} transition={{ duration: reduced ? 0 : .85 }}><Eye x={370} side={-1} {...{ state, blink, reduced }} gaze={head} /></motion.g>
          <motion.g animate={{ x: head.x * 22, scale: 1 - head.x * .06 }} style={{ transformOrigin: "830px 273px" }} transition={{ duration: reduced ? 0 : .85 }}><Eye x={830} side={1} {...{ state, blink, reduced }} gaze={head} /></motion.g>
          <motion.g animate={{ x: head.x * 42, y: head.y * 12 }} transition={{ duration: reduced ? 0 : .95 }}>
          <path d="M 591 351 Q 600 359 609 351" fill="none" stroke="currentColor" strokeWidth="4" opacity=".35" strokeLinecap="round" />
          </motion.g>
          <motion.g animate={{ x: head.x * 25, y: head.y * 10, rotate: state === "listening" ? -3 : head.x * -3 }} style={{ transformOrigin: "600px 455px" }} transition={{ duration: reduced ? 0 : .8 }}>
          <Mouth {...{ state, audioLevel, reduced }} />
          </motion.g>
          <g className="assistant-accents" opacity=".22" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
            <path d="M 212 355 h 20 M 212 367 h 11 M 968 355 h 20 M 977 367 h 11" />
          </g>
        </motion.g>
        </g></g>
      </motion.g>
      </motion.g>
    </svg>
  </div>;
}
