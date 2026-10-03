import type { AssistantState, ViewId, WallDeckSettings } from "@walldeck/contracts";

type RouterSettings = WallDeckSettings["viewRouter"];
type AmbientSleepSettings = WallDeckSettings["ambientSleep"];

export function ambientSleepAction(lux: number, settings: AmbientSleepSettings, darkEpisodeActive: boolean): "sleep" | "reset" | null {
  if (!settings.enabled || settings.source !== "android-sensor" || !Number.isFinite(lux)) return null;
  return thresholdAction(lux, settings.sleepBelowLux, settings.resetAboveLux, darkEpisodeActive);
}

export function cameraSleepAction(brightnessPercent: number, settings: AmbientSleepSettings, darkEpisodeActive: boolean): "sleep" | "reset" | null {
  if (!settings.enabled || settings.source !== "camera" || !settings.cameraEnabled || !Number.isFinite(brightnessPercent)) return null;
  return thresholdAction(brightnessPercent, settings.cameraSleepBelowPercent, settings.cameraResetAbovePercent, darkEpisodeActive);
}

export function homeAssistantSleepAction(state: string, settings: AmbientSleepSettings, darkEpisodeActive: boolean): "sleep" | "reset" | null {
  if (!settings.enabled || settings.source !== "home-assistant" || !settings.homeAssistantEntityId) return null;
  const value = Number(state.trim().replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return thresholdAction(value, settings.homeAssistantSleepBelow, settings.homeAssistantResetAbove, darkEpisodeActive);
}

function thresholdAction(value: number, sleepBelow: number, resetAbove: number, darkEpisodeActive: boolean): "sleep" | "reset" | null {
  if (!darkEpisodeActive && value <= sleepBelow) return "sleep";
  if (darkEpisodeActive && value >= resetAbove) return "reset";
  return null;
}

export function viewAfterTap(current: ViewId, router: RouterSettings, assistantState?: AssistantState): ViewId | null {
  if (current === "music") return null;
  if (current === "assistant-expressive" && assistantState === "sleep") return "ha";
  const rule = router.tapAction;
  return rule.enabled && current === rule.sourceView && rule.targetView !== current ? rule.targetView : null;
}

export function viewAfterSwipeDown(current: ViewId, router: RouterSettings): ViewId | null {
  if (current === "music") return null;
  const rule = router.swipeDownAction;
  return rule.enabled && current === rule.sourceView && rule.targetView !== current ? rule.targetView : null;
}

export interface ScheduledViewTransition {
  target: ViewId;
  seconds: number;
  startsAssistantIdle: boolean;
  completesAssistantIdle: boolean;
}

export function inactivityTransition(current: ViewId, router: RouterSettings, assistantIdleTransition = false, stayOnThisView = false): ScheduledViewTransition | null {
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
  if (current === "assistant-canvas") return { target: "assistant-expressive", seconds: 60, startsAssistantIdle: true, completesAssistantIdle: false };
  if (current === "timers") {
    if (stayOnThisView) return null;
    const showAssistant = rule.targetView === "photos" && rule.showAssistantIdleBeforePhotos;
    return {
      target: showAssistant ? "assistant-expressive" : rule.targetView,
      seconds: rule.seconds,
      startsAssistantIdle: showAssistant,
      completesAssistantIdle: false,
    };
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
