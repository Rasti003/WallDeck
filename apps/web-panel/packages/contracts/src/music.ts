/** Domain contract shared by UI, native adapter and future automation/MCP transport. */
export interface MusicState {
  connection: "disconnected" | "connecting" | "connected" | "error";
  installed: boolean;
  error: string | null;
  paused: boolean;
  positionMs: number;
  observedAt: number;
  speed: number;
  shuffle: boolean;
  repeat: number;
  context: string;
  artwork: string | null;
  track: { uri: string; title: string; artist: string; album: string; durationMs: number } | null;
  capabilities: { queue: boolean; playlists: boolean; like: boolean; playOnDemand: boolean; next: boolean; previous: boolean; seek: boolean; shuffle: boolean; repeatTrack: boolean; repeatContext: boolean };
}

export interface AudioOutputState {
  outputs: { id: string; name: string; type: number; bluetooth: boolean }[];
  bluetoothAvailable: boolean;
  currentOutput: string | null;
  codec: string | null;
  volume: number;
  audioFocus: "managed-by-spotify";
  selectOutput: false;
  fallback: "bluetooth-settings";
}

export interface MusicController {
  connect(clientId: string, authorize?: boolean): Promise<MusicState>;
  disconnect(): Promise<MusicState>;
  getPlaybackState(): Promise<MusicState>;
  subscribePlaybackState(listener: (state: MusicState) => void): () => void;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setShuffle(enabled: boolean): Promise<void>;
  setRepeat(mode: number): Promise<void>;
  playContext(uri: string): Promise<void>;
  addToQueue(uri: string): Promise<void>;
  getQueue(): Promise<{ supported: false; reason: string }>;
  getAudioOutputState(): Promise<AudioOutputState>;
  setVolume(value: number): Promise<void>;
  selectOutput(id: string): Promise<{ supported: false; fallback: string }>;
  openSystemOutputPicker(): Promise<void>;
}
