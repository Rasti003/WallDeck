import { expect, it, vi } from "vitest";
import type { MusicController, MusicState } from "@walldeck/contracts";
import { emptyMusicState } from "./controller";
import { ensureMusicConnected } from "./connection";

const connected: MusicState = { ...emptyMusicState, connection: "connected", installed: true };

it("reuses an existing Spotify connection", async () => {
  const controller = { getPlaybackState: vi.fn().mockResolvedValue(connected), connect: vi.fn() } as unknown as MusicController;
  await expect(ensureMusicConnected(controller, "client", { delayMs: 0 })).resolves.toBe(connected);
  expect(controller.connect).not.toHaveBeenCalled();
});

it("reconnects without opening authorization and waits until ready", async () => {
  const controller = {
    getPlaybackState: vi.fn().mockResolvedValueOnce(emptyMusicState).mockResolvedValueOnce(connected),
    connect: vi.fn().mockResolvedValue({ ...emptyMusicState, connection: "connecting", installed: true }),
  } as unknown as MusicController;
  await expect(ensureMusicConnected(controller, "client", { attempts: 2, delayMs: 0 })).resolves.toBe(connected);
  expect(controller.connect).toHaveBeenCalledWith("client", false);
});
