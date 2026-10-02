import { describe, expect, it } from "vitest";
import { matchingSections, sectionFromPath, sectionPath } from "./admin-navigation";

describe("admin navigation", () => {
  it("restores a bookmarked subsection and safely handles unknown paths", () => {
    expect(sectionFromPath("/admin/voice/")).toBe("voice");
    expect(sectionFromPath("/admin/history")).toBe("history");
    expect(sectionFromPath("/admin")).toBe("overview");
    expect(sectionFromPath("/admin/not-a-page")).toBe("overview");
    expect(sectionPath("voice")).toBe("/admin/voice");
    expect(sectionPath("overview")).toBe("/admin");
  });
  it("finds Polish settings without requiring accents and combines keywords", () => {
    expect(matchingSections("GLOS").map(item => item.id)).toContain("voice");
    expect(matchingSections("zdjecia").map(item => item.id)).toContain("photos");
    expect(matchingSections("glos budzet").map(item => item.id)).toEqual(["voice"]);
    expect(matchingSections("nieistniejaca funkcja")).toEqual([]);
  });
});
