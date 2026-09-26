import { describe, expect, it } from "vitest";
import type { PhotoItem } from "@walldeck/contracts";
import { createPhotoLayout } from "./photo-layout";

function photo(id: string, orientation: PhotoItem["orientation"]): PhotoItem {
  return { id, url: `/api/photos/${id}/file`, width: 100, height: 100, orientation };
}

describe("createPhotoLayout", () => {
  it("shows one landscape photo on a landscape screen", () => {
    const layout = createPhotoLayout([photo("wide", "landscape")], true, null, () => 0);
    expect(layout?.kind).toBe("single");
    expect(layout?.items.map(({ id }) => id)).toEqual(["wide"]);
  });

  it("shows two portrait photos on a landscape screen", () => {
    const layout = createPhotoLayout([photo("left", "portrait"), photo("right", "portrait")], true, null, () => 0);
    expect(layout?.kind).toBe("pair");
    expect(layout?.items.map(({ id }) => id)).toEqual(["left", "right"]);
  });

  it("can choose a portrait pair when both landscape layouts are available", () => {
    const layout = createPhotoLayout(
      [photo("wide", "landscape"), photo("left", "portrait"), photo("right", "portrait")],
      true,
      null,
      () => 0.75,
    );
    expect(layout?.kind).toBe("pair");
    expect(layout?.items.every(({ orientation }) => orientation === "portrait")).toBe(true);
  });

  it("shows one portrait photo on a portrait screen", () => {
    const layout = createPhotoLayout([photo("tall", "portrait")], false, null, () => 0);
    expect(layout?.kind).toBe("single");
    expect(layout?.items[0].id).toBe("tall");
  });

  it("avoids the previous photo when another matching photo exists", () => {
    const previous = createPhotoLayout([photo("first", "landscape")], true, null, () => 0)!;
    const next = createPhotoLayout([photo("first", "landscape"), photo("second", "landscape")], true, previous, () => 0);
    expect(next?.items[0].id).toBe("second");
  });
});
