import type { MusicController, MusicState } from "@walldeck/contracts";

type ConnectionController = Pick<MusicController, "connect" | "getPlaybackState">;

export async function ensureMusicConnected(
  controller: ConnectionController,
  clientId: string,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<MusicState> {
  if (!clientId) throw new Error("Brak Client ID Spotify");
  let state = await controller.getPlaybackState();
  if (state.connection === "connected") return state;
  if (state.connection !== "connecting") state = await controller.connect(clientId, false);
  if (state.connection === "connected") return state;
  if (state.connection === "error") throw new Error(state.error ?? "Nie udało się połączyć ze Spotify");

  const attempts = options.attempts ?? 48;
  const delayMs = options.delayMs ?? 250;
  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    state = await controller.getPlaybackState();
    if (state.connection === "connected") return state;
    if (state.connection === "error") throw new Error(state.error ?? "Nie udało się połączyć ze Spotify");
  }
  throw new Error("Spotify nie połączyło się automatycznie");
}
