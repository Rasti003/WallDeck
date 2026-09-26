import type { AssistantState, ViewId, WallDeckSettings } from "@walldeck/contracts";

type RouterSettings = WallDeckSettings["viewRouter"];
type AmbientSleepSettings = WallDeckSettings["ambientSleep"];

export function ambientSleepAction(lux: number, settings: AmbientSleepSettings, darkEpisodeActive: boolean): "sleep" | "reset" | null {
  if (!settings.enabled || !Number.isFinite(lux)) return null;
  if (!darkEpisodeActive && lux <= settings.sleepBelowLux) return "sleep";
  if (darkEpisodeActive && lux >= settings.resetAboveLux) return "reset";
  return null;
}

export function viewAfterTap(current: ViewId, router: RouterSettings, assistantState?: AssistantState): ViewId | null {
  if (current === "assistant-expressive" && assistantState === "sleep") return "ha";
  const rule = router.tapAction;
  return rule.enabled && current === rule.sourceView && rule.targetView !== current ? rule.targetView : null;
}

export function viewAfterSwipeDown(current: ViewId, router: RouterSettings): ViewId | null {
  const rule = router.swipeDownAction;
  return rule.enabled && current === rule.sourceView && rule.targetView !== current ? rule.targetView : null;
}

export interface ScheduledViewTransition {
  target: ViewId;
  seconds: number;
  startsAssistantIdle: boolean;
  completesAssistantIdle: boolean;
}

export function inactivityTransition(current: ViewId, router: RouterSettings, assistantIdleTransition = false): ScheduledViewTransition | null {
  const rule = router.inactivityAction;
  if (!rule.enabled) return null;
  if (assistantIdleTransition) {
    return current === "assistant-expressive" ? {
      target: rule.targetView,
      seconds: rule.assistantIdleSeconds,
      startsAssistantIdle: false,
      completesAssistantIdle: true,
    } : null;
  }
  if (current !== rule.sourceView || rule.targetView === current) return null;
  const showAssistant = current === "ha" && rule.targetView === "photos" && rule.showAssistantIdleBeforePhotos;
  return {
    target: showAssistant ? "assistant-expressive" : rule.targetView,
    seconds: rule.seconds,
    startsAssistantIdle: showAssistant,
    completesAssistantIdle: false,
  };
}

export function viewAfterActivity(current: ViewId, router: RouterSettings, assistantIdleTransition: boolean): ViewId | null {
  return assistantIdleTransition && current === "assistant-expressive" ? router.inactivityAction.sourceView : null;
}
