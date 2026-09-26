import type { AssistantState } from "@walldeck/contracts";
export { assistantStates, type AssistantState } from "@walldeck/contracts";
export type AssistantEvent = { type: "select"; state: AssistantState } | { type: "timeout" };
export const stateLabels: Record<AssistantState, string> = {
  idle: "Spokój", attention: "Pobudka", listening: "Słucham", thinking: "Myślę",
  speaking: "Mówię", success: "Gotowe", error: "Ups…", sleep: "Sen",
  curious: "Ciekawość", uncertain: "Powtórz?", confirm: "Rozumiem", surprised: "O!", wink: "Oczko", laughing: "Śmiech",
};
// Explicit, deterministic state machine; renderer and future voice pipeline stay independent.
export function assistantTransition(state: AssistantState, event: AssistantEvent): AssistantState {
  if (event.type === "select") return event.state;
  if (state === "attention") return "listening";
  if (["success", "confirm", "surprised", "wink", "laughing"].includes(state)) return "idle";
  return state;
}
export const transientDelay: Partial<Record<AssistantState, number>> = { attention: 750, success: 2200, confirm: 1400, surprised: 1800, wink: 1100, laughing: 3200 };
export function clampAudio(value: number) { return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; }
// Five logical opening bands; interpolate continuously instead of stepping between poses.
export function mouthOpening(value: number) {
  const levels = [0, 5, 15, 30, 48];
  const position = clampAudio(value) * 4;
  const index = Math.min(3, Math.floor(position));
  return levels[index] + (levels[index + 1] - levels[index]) * (position - index);
}
