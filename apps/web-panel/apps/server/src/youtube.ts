import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { viewIdSchema, youtubeConfigSchema, youtubeSearchSchema, youtubePlaySchema, youtubeLatestSchema, youtubeControlSchema, youtubeReportSchema, type YoutubeVideo, type YoutubeChannel, type YoutubeState, type YoutubeReport, type ViewId } from "@walldeck/contracts";
import { EncryptedSecretStore } from "./secret-store.js";

type Dependencies = { currentView(): ViewId; activateView(view: ViewId): void; command(name: string, args: Record<string, unknown>): Promise<unknown>; broadcast(event: unknown): void };
export function durationSeconds(value: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  return match ? Number(match[1] ?? 0)*86400 + Number(match[2] ?? 0)*3600 + Number(match[3] ?? 0)*60 + Number(match[4] ?? 0) : 0;
}
const normalize = (s: string) => s.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
export class YoutubeService {
  config = youtubeConfigSchema.parse({});
  channels: YoutubeChannel[] = [];
  state: YoutubeState = { provider: "youtube", sessionId: null, video: null, positionSeconds: 0, playing: false, volume: 70, status: "stopped", error: null, startedAt: null, returnView: "photos", results: [] };
  history: Array<{ video: YoutubeVideo; positionSeconds: number; updatedAt: string }> = [];
  private cache = new Map<string, { expires: number; value: any }>();
  private inFlight = new Map<string, Promise<any>>();
  private secret: EncryptedSecretStore;
  private file: string;
  private writes = Promise.resolve();
  private apiCalls = 0;
  private lastError: string | null = null;
  private generation = 0;
  constructor(root: string, private deps: Dependencies, private fetcher: typeof fetch = fetch) { this.secret = new EncryptedSecretStore(root, "youtube-api-key"); this.file = path.join(root, "youtube.json"); }
  async load() {
    try { const saved = JSON.parse(await readFile(this.file, "utf8")); this.config = youtubeConfigSchema.parse(saved.config); this.channels = saved.channels ?? []; this.history = (saved.history ?? []).filter((h:any)=>Date.now()-Date.parse(h.updatedAt)<30*86400000).slice(0,100); } catch { /* first start */ }
  }
  private save() {
    const data = JSON.stringify({ config: this.config, channels: this.channels, history: this.history });
    this.writes = this.writes.catch(() => undefined).then(async () => { await writeFile(this.file + ".tmp", data, { mode: 0o600 }); await rename(this.file + ".tmp", this.file); });
    return this.writes;
  }
  private emit() { this.deps.broadcast({ type: "youtube.changed", state: this.state }); }
  captureReturnView(view: ViewId) { if(view !== "youtube" && view !== "assistant-expressive") this.state.returnView=view; return { ok:true }; }
  onNavigation(next: ViewId, previous: ViewId) {
    if(next === "youtube" && previous !== "youtube") this.captureReturnView(previous);
    if(next !== "youtube" && previous === "youtube") {
      this.generation++; this.state.playing=false; this.state.status="stopped"; this.emit();
    }
  }
  async status() { return { ...this.config, configured: Boolean(await this.secret.load()), channels: this.channels, apiCallsSinceRestart: this.apiCalls, lastError: this.lastError, quotaRemaining: null }; }
  async configure(input: unknown) {
    const value = youtubeConfigSchema.extend({ apiKey: z.string().trim().max(200).optional(), clearKey: z.boolean().optional() }).parse(input);
    if (value.clearKey) await this.secret.clear(); else if (value.apiKey) await this.secret.save(value.apiKey);
    this.config = youtubeConfigSchema.parse(value); this.clearCache(); await this.save();
    if (!this.config.enabled && this.state.video) await this.control({ action: "stop" });
    return this.status();
  }
  clearCache() { this.cache.clear(); return { ok: true }; }
  private async request(endpoint: string, params: Record<string,string>) {
    const key = await this.secret.load();
    if (!key) throw new Error("Zapisz klucz YouTube Data API w Media → YouTube");
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.search = new URLSearchParams({ ...params, key }).toString(); this.apiCalls++;
    try {
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(10000) });
      const body = await response.json() as any;
      if (!response.ok) {
        const reason = body.error?.errors?.[0]?.reason;
        throw new Error(reason === "quotaExceeded" || reason === "dailyLimitExceeded" ? "Wyczerpano limit YouTube API. Spróbuj później." : `YouTube API: ${response.status}. Sprawdź klucz, ograniczenia i włączenie Data API v3.`);
      }
      this.lastError = null; return body;
    } catch (error) {
      // Do not expose a fetch error containing the URL and API key.
      const safeMessage = error instanceof Error && (error.message.startsWith("YouTube API:") || error.message.startsWith("Wyczerpano"));
      this.lastError = safeMessage ? error.message : "Nie można połączyć się z YouTube API";
      throw new Error(this.lastError);
    }
  }
  async test() { await this.request("videos", { part: "id", id: "dQw4w9WgXcQ" }); return { ok: true }; }
  private async cached<T>(key: string, ttl: number, task: () => Promise<T>): Promise<T> {
    const found = this.cache.get(key); if (found && found.expires > Date.now()) return found.value;
    const pending = this.inFlight.get(key); if (pending) return pending;
    const work = task().then(value => {
      if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: Date.now() + ttl, value }); return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work); return work;
  }
  private assertEnabled() { if (!this.config.enabled) throw new Error("YouTube jest wyłączony w konfiguracji Media"); }
  async videos(ids: string[]): Promise<YoutubeVideo[]> {
    if (!ids.length) return [];
    const data = await this.request("videos", { part: "snippet,contentDetails,status", id: ids.join(",") });
    const mapped = new Map<string,YoutubeVideo>();
    for (const item of data.items ?? []) {
      if (!item.status?.embeddable || item.status?.privacyStatus !== "public" || item.snippet?.liveBroadcastContent !== "none") continue;
      mapped.set(item.id, { videoId: item.id, title: item.snippet.title, channelName: item.snippet.channelTitle, channelId: item.snippet.channelId, durationSeconds: durationSeconds(item.contentDetails.duration), publishedAt: item.snippet.publishedAt, thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "" });
    }
    return ids.flatMap(id => mapped.has(id) ? [mapped.get(id)!] : []);
  }
  async search({query,limit}: z.infer<typeof youtubeSearchSchema>) {
    this.assertEnabled(); const count = Math.min(limit ?? this.config.maxResults, this.config.maxResults);
    const results = await this.cached(`search:${normalize(query)}:${count}`, 15*60000, async () => {
      const data = await this.request("search", { part: "snippet", q: query, type: "video", videoEmbeddable: "true", maxResults: String(count) });
      return this.videos((data.items ?? []).map((i: any) => i.id.videoId));
    });
    if (this.deps.currentView() !== "youtube" && this.deps.currentView() !== "assistant-expressive") this.state.returnView = this.deps.currentView();
    this.state.results = results; this.emit(); this.deps.activateView("youtube"); return { results, requiresSelection: true };
  }
  async resolveChannel(input: string): Promise<{ channel?: YoutubeChannel; candidates?: Array<{channelId:string;canonicalName:string}> }> {
    const existing = this.channels.find(c => [c.canonicalName,c.channelId,...c.aliases].some(n => normalize(n) === normalize(input)));
    if (existing && Date.now()-Date.parse(existing.resolvedAt) < 30*86400000) return { channel: existing };
    let reference = existing?.channelId ?? input.trim();
    if (/^https?:\/\//i.test(reference)) {
      const url = new URL(reference); if (!["youtube.com","www.youtube.com","m.youtube.com"].includes(url.hostname)) throw new Error("Podaj adres kanału youtube.com");
      reference = url.pathname.replace(/^\/channel\//, "").replace(/^\//, "").replace(/\/$/, "");
    }
    let id: string | undefined = /^UC[\w-]{22}$/.test(reference) ? reference : undefined;
    let data: any;
    if (reference.startsWith("@")) data = await this.request("channels", { part: "snippet,contentDetails", forHandle: reference });
    else {
      if (!id) {
        const found = await this.request("search", { part: "snippet", q: reference, type: "channel", maxResults: "3" });
        const candidates = (found.items ?? []).map((i:any) => ({ channelId: i.id.channelId, canonicalName: i.snippet.title }));
        const exact = candidates.filter((c:any) => normalize(c.canonicalName) === normalize(reference));
        if (exact.length === 1) id = exact[0].channelId;
        else if (candidates.length === 1) id = candidates[0].channelId;
        else return { candidates };
      }
      data = await this.request("channels", { part: "snippet,contentDetails", id: id! });
    }
    const item = data.items?.[0]; if (!item?.contentDetails?.relatedPlaylists?.uploads) throw new Error("Nie znaleziono kanału. Podaj @handle lub channelId.");
    const channel: YoutubeChannel = { canonicalName: item.snippet.title, aliases: [...new Set([...(existing?.aliases ?? []),input, ...(["konopsky","konopski"].includes(normalize(item.snippet.title)) ? ["Konopsky","konopski"] : [])])], channelId: item.id, uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads, resolvedAt: new Date().toISOString() };
    this.channels = [...this.channels.filter(c => c.channelId !== channel.channelId),channel]; await this.save(); return { channel };
  }
  async latest(channel: string) {
    this.assertEnabled(); const resolved = await this.resolveChannel(channel); if (!resolved.channel) return { ...resolved, requiresSelection: true };
    const target = resolved.channel;
    const videos = await this.cached(`latest:${target.channelId}:${this.config.minimumDurationSeconds}`, 3*60000, async () => {
      let token = "";
      for (let page=0; page<3; page++) {
        const data = await this.request("playlistItems", { part: "contentDetails", playlistId: target.uploadsPlaylistId, maxResults: "50", ...(token ? { pageToken: token } : {}) });
        const found = (await this.videos((data.items ?? []).map((i:any) => i.contentDetails.videoId))).filter(v => v.durationSeconds >= this.config.minimumDurationSeconds);
        if (found.length) return found;
        token = data.nextPageToken; if (!token) break;
      }
      return [];
    });
    if (!videos.length) throw new Error("Brak publicznego filmu spełniającego minimalną długość");
    this.state.results = videos.slice(0,5);
    // Bounded fallback for embedding restrictions detected only by the player.
    for (const video of videos.slice(0,3)) {
      const result = await this.play({ videoId: video.videoId });
      if (this.state.status !== "error") return result;
    }
    throw new Error("Nie można odtworzyć ostatnich filmów tego kanału");
  }
  async play(input: z.infer<typeof youtubePlaySchema>) {
    this.assertEnabled(); if (Boolean(input.videoId) === Boolean(input.index)) throw new Error("Podaj videoId albo numer wyniku");
    const selected = input.index ? this.state.results[input.index-1] : (await this.videos([input.videoId!]))[0];
    if (!selected) throw new Error("Film jest niedostępny lub nie można go osadzić");
    const generation = ++this.generation;
    const current = this.deps.currentView(); if (current !== "youtube" && current !== "assistant-expressive") this.state.returnView = current;
    this.state = { ...this.state, video: selected, sessionId: randomUUID(), positionSeconds: 0, playing: false, status: "loading", error: null, startedAt: new Date().toISOString() }; this.emit(); this.deps.activateView("youtube");
    try { const result = await this.deps.command("youtube.play", { video: selected, sessionId: this.state.sessionId, volume: this.state.volume }) as {report?:YoutubeReport;returnView?:ViewId};
      if (generation !== this.generation) return { superseded: true };
      if(result.returnView) this.captureReturnView(viewIdSchema.parse(result.returnView));
      if(result.report) await this.report(youtubeReportSchema.parse(result.report));
      return { result, state: this.state }; }
    catch (error) { if (generation !== this.generation) return { superseded:true }; this.state.status = "error"; this.state.error = error instanceof Error ? error.message : "Nie można uruchomić filmu"; this.emit(); this.deps.activateView(this.state.returnView as ViewId); throw error; }
  }
  async control(input: z.infer<typeof youtubeControlSchema>) {
    const {action,value} = input;
    if (["seek","seekBy","volume"].includes(action) && value === undefined) throw new Error("value jest wymagane");
    if (action === "volume" && (value! < 0 || value! > 100)) throw new Error("Głośność musi być od 0 do 100");
    if (action === "seek" && value! < 0 || action === "seekBy" && Math.abs(value!) > 86400) throw new Error("Nieprawidłowa pozycja");
    if (action === "next" || action === "previous") {
      const index = this.state.results.findIndex(v => v.videoId === this.state.video?.videoId) + (action === "next" ? 1 : -1);
      const video = this.state.results[index]; if (!video) throw new Error("Brak kolejnego filmu w wynikach"); return this.play({ videoId: video.videoId });
    }
    const result = this.state.video ? await this.deps.command("youtube.control", input) : {status:"stopped"};
    if (action === "stop" || action === "returnView") { this.generation++; this.state.playing=false; this.state.status="stopped"; this.emit(); this.deps.activateView(this.state.returnView as ViewId); }
    return { result, state: this.state };
  }
  async report(input: YoutubeReport) {
    if (input.sessionId !== this.state.sessionId || input.videoId !== this.state.video?.videoId) return { ok: false };
    if(this.deps.currentView() !== "youtube" && input.playing) return { ok:false };
    const endedAlready = this.state.status === "ended";
    Object.assign(this.state, input);
    if (this.state.video) {
      this.history = [{ video: this.state.video, positionSeconds: input.positionSeconds, updatedAt: new Date().toISOString() }, ...this.history.filter(h => h.video.videoId !== input.videoId && Date.now()-Date.parse(h.updatedAt)<30*86400000)].slice(0,100);
      await this.save();
    }
    this.emit();
    if (input.status === "ended" && !endedAlready) {
      if (this.config.autoNext) { try { await this.control({ action: "next" }); } catch { this.deps.activateView(this.state.returnView as ViewId); } }
      else this.deps.activateView(this.state.returnView as ViewId);
    }
    return { ok: true };
  }
  async editChannels(input: unknown) {
    this.channels = z.array(z.object({ canonicalName: z.string().trim().min(1).max(200), aliases: z.array(z.string().trim().min(1).max(200)).max(30), channelId: z.string().regex(/^UC[\w-]{22}$/), uploadsPlaylistId: z.string().regex(/^[\w-]{10,80}$/), resolvedAt: z.string().datetime() })).max(100).parse(input);
    this.clearCache(); await this.save(); return this.status();
  }
}
export function registerYoutube(app: FastifyInstance, service: YoutubeService) {
  app.get("/api/youtube/config", () => service.status());
  app.put("/api/youtube/config", r => service.configure(r.body));
  app.post("/api/youtube/test", () => service.test());
  app.delete("/api/youtube/cache", () => service.clearCache());
  app.put("/api/youtube/channels", r => service.editChannels(r.body));
  app.post("/api/youtube/channels", r => service.resolveChannel(z.object({ channel: z.string().trim().min(1).max(200) }).parse(r.body).channel));
  app.get("/api/youtube/state", () => service.state);
  app.post("/api/youtube/return-view", r => service.captureReturnView(viewIdSchema.parse((r.body as {view?:unknown})?.view)));
  app.get("/api/youtube/history", () => service.history);
  app.post("/api/youtube/search", r => service.search(youtubeSearchSchema.parse(r.body)));
  app.post("/api/youtube/play", r => service.play(youtubePlaySchema.parse(r.body)));
  app.post("/api/youtube/latest", r => service.latest(youtubeLatestSchema.parse(r.body).channel));
  app.post("/api/youtube/control", r => service.control(youtubeControlSchema.parse(r.body)));
  app.post("/api/youtube/report", r => service.report(youtubeReportSchema.parse(r.body)));
}
