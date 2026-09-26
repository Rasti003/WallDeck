import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "@walldeck/contracts";
import { inactivityTransition, viewAfterActivity, viewAfterSwipeDown, viewAfterTap } from "./view-manager";

describe("view manager", () => {
  it("migrates old settings to the default tap and inactivity rules", () => {
    const { viewRouter: _omitted, ...legacy } = defaultSettings;
    const settings = settingsSchema.parse(legacy);
    expect(settings.viewRouter.tapAction).toEqual({ enabled: true, sourceView: "photos", targetView: "ha" });
    expect(settings.viewRouter.swipeDownAction).toEqual({ enabled: true, sourceView: "photos", targetView: "ha" });
    expect(settings.viewRouter.inactivityAction).toEqual({ enabled: true, sourceView: "ha", seconds: 30, targetView: "photos", showAssistantIdleBeforePhotos: true, assistantIdleSeconds: 10 });
  });

  it("opens HA from photos and schedules the assistant idle transition from HA", () => {
    const router = defaultSettings.viewRouter;
    expect(viewAfterTap("photos", router)).toBe("ha");
    expect(viewAfterTap("ha", router)).toBeNull();
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

  it("can bypass the assistant idle transition", () => {
    const router = { ...defaultSettings.viewRouter, inactivityAction: { ...defaultSettings.viewRouter.inactivityAction, showAssistantIdleBeforePhotos: false } };
    expect(inactivityTransition("ha", router)).toEqual({ target: "photos", seconds: 30, startsAssistantIdle: false, completesAssistantIdle: false });
  });
});
