import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmod, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SpotifyItem, SpotifyQueue, SpotifyStatus } from "@walldeck/contracts";

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
type StoredTokens = { iv: string; tag: string; ciphertext: string };
type SpotifyImage = { url?: string };
type SpotifyRaw = Record<string, any>;

const scopes = ["playlist-read-private", "user-read-playback-state", "user-read-currently-playing"];
const base64url = (value: Buffer) => value.toString("base64url");

async function readOrCreateKey(keyPath: string) {
  try {
    const key = Buffer.from(await readFile(keyPath, "utf8"), "base64");
    if (key.length === 32) return key;
  } catch { /* create below */ }
  const key = randomBytes(32);
  await writeFile(keyPath, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  await chmod(keyPath, 0o600).catch(() => undefined);
  return key;
}

function image(item: SpotifyRaw): string | null {
  const images = (item.images ?? item.album?.images ?? []) as SpotifyImage[];
  return images.find(value => typeof value.url === "string")?.url ?? null;
}

function artists(item: SpotifyRaw) {
  return Array.isArray(item.artists) ? item.artists.map((artist: SpotifyRaw) => artist.name).filter(Boolean).join(", ") : "";
}

function mapItem(item: SpotifyRaw | null | undefined): SpotifyItem | null {
  if (!item || typeof item.uri !== "string" || typeof item.name !== "string") return null;
  const type = item.type as SpotifyItem["type"];
  if (!["track", "album", "artist", "playlist", "episode"].includes(type)) return null;
  const subtitle = type === "playlist"
    ? `${item.owner?.display_name ?? "Spotify"}${typeof item.tracks?.total === "number" ? ` · ${item.tracks.total} utworów` : ""}`
    : type === "episode" ? (item.show?.name ?? "Podcast") : (artists(item) || item.album?.name || "Spotify");
  return { uri: item.uri, type, name: item.name, subtitle, image: image(item) };
}

export class SpotifyConnector {
  private readonly tokenPath: string;
  private readonly keyPath: string;
  private tokens: Tokens | null = null;
  private clientId = "";
  private account: string | null = null;
  private lastError: string | null = null;
  private pending = new Map<string, { verifier: string; expiresAt: number }>();

  readonly redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8888/api/spotify/callback";

  constructor(runtimeRoot: string) {
    this.tokenPath = path.join(runtimeRoot, "spotify-tokens.json");
    this.keyPath = path.join(runtimeRoot, ".spotify-key");
  }

  async load(clientId: string) {
    this.clientId = clientId;
    try {
      const stored = JSON.parse(await readFile(this.tokenPath, "utf8")) as StoredTokens;
      const key = await readOrCreateKey(this.keyPath);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv, "base64"));
      decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
      this.tokens = JSON.parse(Buffer.concat([decipher.update(Buffer.from(stored.ciphertext, "base64")), decipher.final()]).toString("utf8")) as Tokens;
    } catch {
      this.tokens = null;
      this.account = null;
      return;
    }
    await this.profile().catch(() => undefined);
  }

  configure(clientId: string) {
    if (clientId !== this.clientId) { this.clientId = clientId; this.account = null; }
  }

  status(): SpotifyStatus {
    return { configured: Boolean(this.clientId), connected: Boolean(this.tokens), account: this.account, lastError: this.lastError, redirectUri: this.redirectUri };
  }

  beginAuth() {
    if (!this.clientId) throw new Error("Najpierw zapisz Spotify Client ID");
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(64));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    this.pending.set(state, { verifier, expiresAt: Date.now() + 10 * 60_000 });
    const url = new URL("https://accounts.spotify.com/authorize");
    url.search = new URLSearchParams({ client_id: this.clientId, response_type: "code", redirect_uri: this.redirectUri, code_challenge_method: "S256", code_challenge: challenge, state, scope: scopes.join(" ") }).toString();
    return url.toString();
  }

  async completeAuth(code: string, state: string) {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("Sesja logowania wygasła. Rozpocznij logowanie ponownie.");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, grant_type: "authorization_code", code, redirect_uri: this.redirectUri, code_verifier: pending.verifier }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Spotify odrzucił logowanie (${response.status})`);
    const value = await response.json() as { access_token: string; refresh_token: string; expires_in: number };
    this.tokens = { accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: Date.now() + value.expires_in * 1000 };
    await this.save();
    await this.profile();
  }

  async disconnect() {
    this.tokens = null; this.account = null; this.lastError = null;
    await unlink(this.tokenPath).catch(() => undefined);
  }

  async search(query: string, types: SpotifyItem["type"][] = ["track", "playlist"], limit = 10) {
    const allowed = types.filter(type => ["track", "album", "artist", "playlist", "episode"].includes(type));
    const data = await this.api(`/v1/search?${new URLSearchParams({ q: query, type: allowed.join(","), limit: String(Math.min(10, Math.max(1, limit))) })}`);
    const result: SpotifyItem[] = [];
    for (const type of allowed) for (const raw of data[`${type}s`]?.items ?? []) { const item = mapItem(raw); if (item) result.push(item); }
    return result;
  }

  async playlists(limit = 10) {
    const data = await this.api(`/v1/me/playlists?limit=${Math.min(10, Math.max(1, limit))}`);
    return (data.items ?? []).map(mapItem).filter(Boolean) as SpotifyItem[];
  }

  async queue(): Promise<SpotifyQueue> {
    const data = await this.api("/v1/me/player/queue");
    return { currentlyPlaying: mapItem(data.currently_playing), items: (data.queue ?? []).map(mapItem).filter(Boolean).slice(0, 20) as SpotifyItem[] };
  }

  private async profile() {
    const data = await this.api("/v1/me");
    this.account = data.display_name ?? data.id ?? null;
  }

  private async api(endpoint: string): Promise<SpotifyRaw> {
    try {
      const token = await this.accessToken();
      const response = await fetch(`https://api.spotify.com${endpoint}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (response.status === 204) return {};
      if (!response.ok) throw new Error(response.status === 403 ? "Spotify nie udostępnia tej funkcji dla tego konta lub aplikacji" : `Spotify API odpowiedziało ${response.status}`);
      this.lastError = null;
      return await response.json() as SpotifyRaw;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async accessToken() {
    if (!this.tokens) throw new Error("Połącz konto Spotify w panelu administratora");
    if (this.tokens.expiresAt > Date.now() + 60_000) return this.tokens.accessToken;
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, grant_type: "refresh_token", refresh_token: this.tokens.refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) { this.tokens = null; throw new Error("Sesja Spotify wygasła. Połącz konto ponownie."); }
    const value = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
    this.tokens = { accessToken: value.access_token, refreshToken: value.refresh_token ?? this.tokens.refreshToken, expiresAt: Date.now() + value.expires_in * 1000 };
    await this.save();
    return this.tokens.accessToken;
  }

  private async save() {
    if (!this.tokens) return;
    const key = await readOrCreateKey(this.keyPath);
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(this.tokens), "utf8"), cipher.final()]);
    const stored: StoredTokens = { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
    await writeFile(this.tokenPath, `${JSON.stringify(stored)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.tokenPath, 0o600).catch(() => undefined);
  }
}
