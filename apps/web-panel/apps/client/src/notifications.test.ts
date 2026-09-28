import { describe, expect, it } from "vitest";
import { defaultSettings, notificationPreviewSchema } from "@walldeck/contracts";
import { resolveNotificationPresentation } from "./notification-config";
import { notificationTone } from "./notification-sound";

describe("notifications", () => {
  it("uses global duration and sound for ordinary messages", () => {
    expect(resolveNotificationPresentation({ id: "1", message: "test", kind: "info" }, defaultSettings.notifications)).toMatchObject({ alarm: false, persistent: false, durationMs: 5000, sound: "none" });
  });
  it("keeps alarms visible until dismissed by default", () => {
    expect(resolveNotificationPresentation({ id: "2", message: "alarm", kind: "error", priority: "alarm" }, defaultSettings.notifications)).toMatchObject({ alarm: true, persistent: true, sound: "alarm" });
  });
  it("allows event overrides for previews and future integrations", () => {
    expect(resolveNotificationPresentation({ id: "3", message: "custom", kind: "info", priority: "alarm", persistent: false, durationMs: 8000, sound: "none", volume: .1 }, defaultSettings.notifications)).toMatchObject({ persistent: false, durationMs: 8000, sound: "none", volume: .1 });
  });
  it("defines silent, normal and alarm patterns", () => {
    expect(notificationTone("none")).toEqual([]);
    expect(notificationTone("chime")).toHaveLength(2);
    expect(notificationTone("alarm")).toHaveLength(3);
  });
  it("rejects unsafe preview values before broadcasting", () => {
    expect(notificationPreviewSchema.safeParse({ priority: "alarm", persistent: true, durationMs: 30_000, sound: "alarm", volume: .35 }).success).toBe(true);
    expect(notificationPreviewSchema.safeParse({ priority: "alarm", persistent: true, durationMs: Infinity, sound: "file:///secret", volume: 10 }).success).toBe(false);
  });
});
