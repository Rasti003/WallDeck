import { describe, it, expect } from "vitest";
import { advanceHistory } from "./history";
import { photoGeometry } from "./CroppedPhoto";
import { createPhotoLayout, type PhotoLayout } from "../views/photo-layout";
import { settingsSchema, defaultSettings } from "@walldeck/contracts";
describe("gallery", () => {
  it("returns to actual history without drawing another random photo", () => {
    const a = { key: "a", kind: "single", items: [] } as PhotoLayout;
    const b = { ...a, key: "b" };
    const initial = { items: [a, b], index: 1 };
    const back = advanceHistory(initial, -1, () => { throw Error("must not draw"); });
    expect(back.index).toBe(0);
    expect(advanceHistory(back, 1, () => { throw Error("must not draw"); })).toEqual(initial);
  });
  it("covers frame after rotation and preserves crop boundaries", () => {
    const g = photoGeometry(1200, 800, 500, 800, 90, { x: 0, y: 1, zoom: 2 });
    expect(g.height).toBeGreaterThanOrEqual(500);
    expect(g.width).toBeGreaterThanOrEqual(800);
    expect(g.left - g.height / 2).toBeCloseTo(0);
    expect(g.top + g.width / 2).toBeCloseTo(800);
  });
  it("never repeats the same photo in a pair when history excludes all candidates", () => {
    const photos = ["a", "b"].map(id => ({ id, url: id, width: 800, height: 1200, orientation: "portrait" as const }));
    const first = createPhotoLayout(photos, true, null, () => 0)!;
    const next = createPhotoLayout(photos, true, first, () => 0)!;
    expect(new Set(next.items.map(p => p.id)).size).toBe(2);
  });
  it("migrates existing settings", () => {
    const { gallery, ...old } = defaultSettings;
    expect(settingsSchema.parse(old).gallery).toEqual(gallery);
  });
});
