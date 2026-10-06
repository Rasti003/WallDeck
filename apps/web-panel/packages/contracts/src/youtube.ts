import { z } from "zod";

export const youtubeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  minimumDurationSeconds: z.number().int().min(1).max(3600).default(181),
  maxResults: z.number().int().min(3).max(5).default(5),
  autoNext: z.boolean().default(false),
});
export type YoutubeConfig = z.infer<typeof youtubeConfigSchema>;
export const youtubeVideoIdSchema = z.string().regex(/^[\w-]{11}$/);
export const youtubeSearchSchema = z.object({ query: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(5).optional() });
export const youtubePlaySchema = z.object({ videoId: youtubeVideoIdSchema.optional(), index: z.number().int().min(1).max(5).optional() });
export const youtubeLatestSchema = z.object({ channel: z.string().trim().min(1).max(200), mode: z.enum(["normal"]).default("normal") });
export const youtubeControlSchema = z.object({ action: z.enum(["pause", "resume", "stop", "returnView", "seek", "seekBy", "volume", "next", "previous", "restart"]), value: z.number().finite().optional() });
export interface YoutubeVideo { videoId: string; title: string; channelName: string; channelId: string; durationSeconds: number; publishedAt: string; thumbnail: string; }
export interface YoutubeChannel { canonicalName: string; aliases: string[]; channelId: string; uploadsPlaylistId: string; resolvedAt: string; }
export const youtubeReportSchema = z.object({ sessionId: z.string().uuid(), videoId: youtubeVideoIdSchema, positionSeconds: z.number().min(0).max(604800), playing: z.boolean(), volume: z.number().min(0).max(100), status: z.enum(["loading", "playing", "paused", "blocked", "ended", "error", "stopped"]), error: z.string().max(200).nullable().default(null) });
export type YoutubeReport = z.infer<typeof youtubeReportSchema>;
export interface YoutubeState { provider: "youtube"; sessionId: string | null; video: YoutubeVideo | null; positionSeconds: number; playing: boolean; volume: number; status: YoutubeReport["status"]; error: string | null; startedAt: string | null; returnView: string; results: YoutubeVideo[]; }
