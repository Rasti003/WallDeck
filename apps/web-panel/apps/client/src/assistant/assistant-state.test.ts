import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema, viewIdSchema } from "@walldeck/contracts";
import { assistantStates, assistantTransition, clampAudio, mouthOpening } from "./assistant-state";

describe("assistant state machine", () => {
  it("allows every expression from every state and cancels stale transient transitions", () => {
    for (const source of assistantStates) for (const target of assistantStates) {
      expect(assistantTransition(source, { type: "select", state: target })).toBe(target);
    }
    expect(assistantTransition("attention", { type: "timeout" })).toBe("listening");
    expect(assistantTransition("success", { type: "timeout" })).toBe("idle");
    expect(assistantTransition("sleep", { type: "timeout" })).toBe("sleep");
  });
  it("clamps audio and continuously interpolates all mouth bands", () => {
    expect(clampAudio(NaN)).toBe(0);
    expect(mouthOpening(-2)).toBe(0);
    expect(mouthOpening(2)).toBe(48);
    for (const boundary of [.25, .5, .75]) expect(Math.abs(mouthOpening(boundary - .0001) - mouthOpening(boundary + .0001))).toBeLessThan(.02);
  });
  it("migrates existing settings and accepts the new view in routing", () => {
    expect(settingsSchema.parse({ ...defaultSettings, viewBrightness: { photos: .3, ha: .4 } }).viewBrightness).toEqual({ photos: .3, ha: .4, "assistant-demo": .65 });
    expect(viewIdSchema.parse("assistant-demo")).toBe("assistant-demo");
  });
});
