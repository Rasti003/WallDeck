import { describe, expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "@walldeck/contracts";
import { emptyMusicState, playbackPosition } from "./controller";
import { viewAfterTap, viewAfterSwipeDown } from "../view-manager";

describe("music integration boundaries", () => {
  it("does not navigate away when using playback controls even with a matching tap rule", () => {
    const router = { ...defaultSettings.viewRouter, tapAction: { enabled: true, sourceView: "music" as const, targetView: "ha" as const }, swipeDownAction: { enabled: true, sourceView: "music" as const, targetView: "ha" as const } };
    expect(viewAfterTap("music", router)).toBeNull();
    expect(viewAfterSwipeDown("music", router)).toBeNull();
  });
  it("migrates existing settings and rejects secrets or URLs as client IDs", () => {
    const { music: _, ...legacy } = defaultSettings;
    const { music: __, ...brightness } = legacy.viewBrightness;
    const migrated = settingsSchema.parse({ ...legacy, viewBrightness: brightness });
    expect(migrated.music.clientId).toBe("");
    expect(migrated.viewBrightness.music).toBe(.65);
    expect(settingsSchema.safeParse({ ...migrated, music: { clientId: "https://example.com?secret=abc" } }).success).toBe(false);
  });
  it("interpolates only connected playback and clamps at track duration", () => {
    const state = { ...emptyMusicState, connection: "connected" as const, paused: false, observedAt: 1000, positionMs: 2000, track: { uri: "", title: "", album: "", artist: "", durationMs: 5000 } };
    expect(playbackPosition(state, 2000)).toBe(3000);
    expect(playbackPosition(state, 10000)).toBe(5000);
    expect(playbackPosition({ ...state, paused: true }, 10000)).toBe(2000);
    expect(playbackPosition({ ...state, connection: "disconnected" }, 10000)).toBe(2000);
    expect(playbackPosition(state, 0)).toBe(2000);
  });
});

it("migrates menu settings and rejects empty or duplicate menu entries", () => {
 const { tabletMenu, ...legacy } = defaultSettings;
 expect(settingsSchema.parse(legacy).tabletMenu.views).toEqual(tabletMenu.views);
 const { showHandle: _showHandle, ...legacyMenu } = tabletMenu;
 expect(settingsSchema.parse({...defaultSettings,tabletMenu:legacyMenu}).tabletMenu.showHandle).toBe(false);
 expect(settingsSchema.parse({...defaultSettings,tabletMenu:{...tabletMenu,showHandle:true}}).tabletMenu.showHandle).toBe(true);
 expect(settingsSchema.safeParse({...defaultSettings,tabletMenu:{enabled:true,views:[]}}).success).toBe(false);
 expect(settingsSchema.safeParse({...defaultSettings,tabletMenu:{enabled:true,views:["music","music"]}}).success).toBe(false);
});
