import { afterEach, expect, it, vi } from "vitest";
import { mediaSurface } from "./media-surface";
const cleanup: Array<()=>void>=[];
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));
it("pauses Spotify before YouTube and stops YouTube before Spotify",async()=>{
  const pause=vi.fn(),stop=vi.fn(),duck=vi.fn();
  cleanup.push(mediaSurface.register("spotify",{pause,stop:vi.fn()}),mediaSurface.register("youtube",{pause:vi.fn(),stop,duck}));
  await mediaSurface.activate("youtube");expect(pause).toHaveBeenCalledOnce();expect(stop).not.toHaveBeenCalled();
  mediaSurface.duck(true);mediaSurface.duck(false);expect(duck.mock.calls).toEqual([[true],[false]]);
  await mediaSurface.activate("spotify");expect(stop).toHaveBeenCalledOnce();expect(mediaSurface.provider).toBe("spotify");
});
it("does not start a provider when pausing the previous one fails",async()=>{
  cleanup.push(mediaSurface.register("spotify",{pause:()=>Promise.reject(Error("offline")),stop:vi.fn()}));
  await expect(mediaSurface.activate("youtube")).rejects.toThrow("offline");expect(mediaSurface.provider).toBeNull();
});
