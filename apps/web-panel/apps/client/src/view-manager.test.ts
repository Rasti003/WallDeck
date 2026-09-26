import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "@walldeck/contracts";
import { inactivityTarget, viewAfterTap } from "./view-manager";

describe("view manager", () => {
  it("migrates old settings to the default tap and inactivity rules", () => {
    const { viewRouter: _omitted, ...legacy } = defaultSettings;
    const settings = settingsSchema.parse(legacy);
    expect(settings.viewRouter.tapAction).toEqual({ enabled: true, sourceView: "photos", targetView: "ha" });
    expect(settings.viewRouter.inactivityAction).toEqual({ enabled: true, seconds: 30, targetView: "photos" });
  });

  it("opens HA from photos and returns to photos only from another view", () => {
    const router = defaultSettings.viewRouter;
    expect(viewAfterTap("photos", router)).toBe("ha");
    expect(viewAfterTap("ha", router)).toBeNull();
    expect(inactivityTarget("ha", router)).toBe("photos");
    expect(inactivityTarget("photos", router)).toBeNull();
  });
});
