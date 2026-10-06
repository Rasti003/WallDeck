/** Provider arbitration shared by native Spotify and the embedded YouTube surface. */
export type MediaProvider = "spotify" | "youtube";
type Adapter = { pause(): Promise<void> | void; stop(): Promise<void> | void; duck?(active: boolean): void };
const adapters = new Map<MediaProvider, Adapter>();
let activeProvider: MediaProvider | null = null;
export const mediaSurface = {
  register(provider: MediaProvider, adapter: Adapter) { adapters.set(provider, adapter); return () => { adapters.delete(provider); if(activeProvider===provider)activeProvider=null; }; },
  async activate(provider: MediaProvider) {
    for(const [other,adapter] of adapters) if(other!==provider) {
      if(other==="youtube") await adapter.stop(); else await adapter.pause();
    }
    activeProvider=provider;
  },
  duck(active: boolean) { for(const adapter of adapters.values())adapter.duck?.(active); },
  get provider() { return activeProvider; },
};
