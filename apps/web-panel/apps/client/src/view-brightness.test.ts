import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "@walldeck/contracts";

describe("view brightness settings", () => {
  it("adds the default brightness when loading settings saved by an older version", () => {
    const { viewBrightness: _omitted, ...legacySettings } = defaultSettings;
    expect(settingsSchema.parse(legacySettings).viewBrightness.photos).toBe(0.75);
  });

  it("keeps the configured brightness in the safe range", () => {
    expect(settingsSchema.safeParse({ ...defaultSettings, viewBrightness: { photos: 0.05 } }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...defaultSettings, viewBrightness: { photos: 0.01 } }).success).toBe(false);
  });
});
