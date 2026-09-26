import { describe, expect, it } from "vitest";
import { createOverlayItemId } from "./overlay-item-id";

describe("createOverlayItemId", () => {
  it("uses randomUUID when the browser supports it", () => {
    expect(createOverlayItemId({ randomUUID: () => "native-id" })).toBe("native-id");
  });

  it("creates an RFC 4122 identifier when randomUUID is unavailable", () => {
    const id = createOverlayItemId({ getRandomValues: (values) => values.fill(0xab) });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("still creates a valid short identifier without Web Crypto", () => {
    expect(createOverlayItemId(null)).toMatch(/^overlay-[a-z0-9]+-[a-z0-9]+$/);
  });
});
