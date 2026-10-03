import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "@walldeck/contracts";
import { ambientSleepAction, cameraSleepAction, homeAssistantSleepAction, inactivityTransition, viewAfterActivity, viewAfterSwipeDown, viewAfterTap } from "./view-manager";

describe("view manager", () => {
  it("migrates old settings to the default tap and inactivity rules", () => {
    const { viewRouter: _router, ambientSleep: _ambient, ...legacy } = defaultSettings;
    const settings = settingsSchema.parse(legacy);
    expect(settings.viewRouter.tapAction).toEqual({ enabled: true, sourceView: "photos", targetView: "ha" });
    expect(settings.viewRouter.swipeDownAction).toEqual({ enabled: true, sourceView: "photos", targetView: "ha" });
    expect(settings.viewRouter.inactivityAction).toEqual({ enabled: true, sourceView: "ha", seconds: 30, targetView: "photos", showAssistantIdleBeforePhotos: true, assistantIdleSeconds: 10 });
    expect(settings.ambientSleep).toEqual({ enabled: true, source: "home-assistant", homeAssistantEntityId: null, homeAssistantSleepBelow: 5, homeAssistantResetAbove: 15, sleepEntryDelaySeconds: 1.6, sleepBelowLux: 5, resetAboveLux: 15, cameraEnabled: false, cameraSleepBelowPercent: 5, cameraResetAbovePercent: 15, cameraSampleSeconds: 30 });
  });

  it("opens HA from photos and schedules the assistant idle transition from HA", () => {
    const router = defaultSettings.viewRouter;
    expect(viewAfterTap("photos", router)).toBe("ha");
    expect(viewAfterTap("ha", router)).toBeNull();
    expect(viewAfterTap("assistant-expressive", router, "sleep")).toBe("ha");
    expect(viewAfterSwipeDown("photos", router)).toBe("ha");
    expect(viewAfterSwipeDown("ha", router)).toBeNull();
    expect(inactivityTransition("ha", router)).toEqual({ target: "assistant-expressive", seconds: 30, startsAssistantIdle: true, completesAssistantIdle: false });
    expect(inactivityTransition("photos", router)).toBeNull();
  });

  it("finishes assistant idle in photos and interrupts it back to HA", () => {
    const router = defaultSettings.viewRouter;
    expect(inactivityTransition("assistant-expressive", router, true)).toEqual({ target: "photos", seconds: 10, startsAssistantIdle: false, completesAssistantIdle: true });
    expect(viewAfterActivity("assistant-expressive", router, true)).toBe("ha");
    expect(viewAfterActivity("assistant-expressive", router, false)).toBeNull();
  });

  it("returns an unpinned clock through assistant idle and keeps an active timer visible", () => {
    const router = defaultSettings.viewRouter;
    expect(inactivityTransition("timers", router, false, false)).toEqual({ target: "assistant-expressive", seconds: 30, startsAssistantIdle: true, completesAssistantIdle: false });
    expect(inactivityTransition("timers", router, false, true)).toBeNull();
  });

  it("returns Canvas through the assistant idle transition", () => {
    const router = defaultSettings.viewRouter;
    expect(inactivityTransition("assistant-canvas", router)).toEqual({ target: "assistant-expressive", seconds: 60, startsAssistantIdle: true, completesAssistantIdle: false });
  });

  it("can bypass the assistant idle transition", () => {
    const router = { ...defaultSettings.viewRouter, inactivityAction: { ...defaultSettings.viewRouter.inactivityAction, showAssistantIdleBeforePhotos: false } };
    expect(inactivityTransition("ha", router)).toEqual({ target: "photos", seconds: 30, startsAssistantIdle: false, completesAssistantIdle: false });
  });

  it("enters sleep once below the light threshold and rearms above the reset threshold", () => {
    const settings = { ...defaultSettings.ambientSleep, source: "android-sensor" as const };
    expect(ambientSleepAction(4, settings, false)).toBe("sleep");
    expect(ambientSleepAction(3, settings, true)).toBeNull();
    expect(ambientSleepAction(10, settings, true)).toBeNull();
    expect(ambientSleepAction(15, settings, true)).toBe("reset");
    expect(ambientSleepAction(Number.NaN, settings, false)).toBeNull();
    const cameraSettings = { ...settings, source: "camera" as const, cameraEnabled: true };
    expect(cameraSleepAction(3, cameraSettings, false)).toBe("sleep");
    expect(cameraSleepAction(10, cameraSettings, true)).toBeNull();
    expect(cameraSleepAction(20, cameraSettings, true)).toBe("reset");
    expect(cameraSleepAction(0, { ...settings, cameraEnabled: false }, false)).toBeNull();
  });

  it("uses a numeric Home Assistant state with hysteresis", () => {
    const settings = { ...defaultSettings.ambientSleep, homeAssistantEntityId: "sensor.outdoor_lux", homeAssistantSleepBelow: 8, homeAssistantResetAbove: 15 };
    expect(homeAssistantSleepAction("7.5", settings, false)).toBe("sleep");
    expect(homeAssistantSleepAction("10", settings, true)).toBeNull();
    expect(homeAssistantSleepAction("15", settings, true)).toBe("reset");
    expect(homeAssistantSleepAction("unknown", settings, false)).toBeNull();
    expect(homeAssistantSleepAction("7", { ...settings, homeAssistantEntityId: null }, false)).toBeNull();
  });
});
