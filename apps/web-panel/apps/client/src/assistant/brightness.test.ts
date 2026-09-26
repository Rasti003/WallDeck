import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "@walldeck/contracts";
import { assistantBrightness } from "./brightness";

describe("assistant brightness", () => {
  it("migrates old settings without losing the existing global brightness", () => {
    const { assistantBrightness: omitted, ...old } = defaultSettings;
    const migrated = settingsSchema.parse({ ...old, viewBrightness: { ...old.viewBrightness, "assistant-expressive": .4 } });
    expect(assistantBrightness(migrated, "idle")).toBe(.4);
    expect(assistantBrightness(migrated, "sleep")).toBe(.05);
  });
  it("prioritizes overrides, then global brightness, then the system", () => {
    const settings = settingsSchema.parse({ ...defaultSettings, assistantBrightness: { globalEnabled: false, overrides: { sleep: .08 } } });
    expect(assistantBrightness(settings, "sleep")).toBe(.08);
    expect(assistantBrightness(settings, "idle")).toBe(-1);
    settings.assistantBrightness.overrides.sleep = null;
    expect(assistantBrightness(settings, "sleep")).toBe(-1);
    settings.assistantBrightness.globalEnabled = true;
    expect(assistantBrightness(settings, "sleep")).toBe(.65);
  });
  it("rejects unknown states and out-of-range brightness", () => {
    for (const overrides of [{ unknown: .5 }, { sleep: 0 }, { sleep: 1.1 }]) {
      expect(settingsSchema.safeParse({ ...defaultSettings, assistantBrightness: { globalEnabled: true, overrides } }).success).toBe(false);
    }
  });
});
