import { z } from "zod";

export const assistantStates = ["idle", "attention", "listening", "thinking", "speaking", "success", "error", "sleep", "curious", "uncertain", "confirm", "surprised", "wink", "laughing"] as const;
export const assistantStateSchema = z.enum(assistantStates);
export type AssistantState = z.infer<typeof assistantStateSchema>;
export const assistantBrightnessSchema = z.object({
  globalEnabled: z.boolean().default(true),
  overrides: z.partialRecord(assistantStateSchema, z.number().min(.05).max(1).nullable()).default({ sleep: .05 }),
}).default({ globalEnabled: true, overrides: { sleep: .05 } });

export const viewIdSchema = z.preprocess(value => value === "assistant-demo" ? "assistant-expressive" : value, z.enum(["photos", "ha", "assistant-expressive"]));
export type ViewId = z.infer<typeof viewIdSchema>;

export const viewRouterSettingsSchema = z.object({
  tapAction: z.object({
    enabled: z.boolean(),
    sourceView: viewIdSchema,
    targetView: viewIdSchema,
  }),
  swipeDownAction: z.object({
    enabled: z.boolean(),
    sourceView: viewIdSchema,
    targetView: viewIdSchema,
  }).default({ enabled: true, sourceView: "photos", targetView: "ha" }),
  inactivityAction: z.object({
    enabled: z.boolean(),
    sourceView: viewIdSchema.default("ha"),
    seconds: z.number().int().min(5).max(3600),
    targetView: viewIdSchema,
    showAssistantIdleBeforePhotos: z.boolean().default(true),
    assistantIdleSeconds: z.number().int().min(3).max(300).default(10),
  }),
}).default({
  tapAction: { enabled: true, sourceView: "photos", targetView: "ha" },
  swipeDownAction: { enabled: true, sourceView: "photos", targetView: "ha" },
  inactivityAction: { enabled: true, sourceView: "ha", seconds: 30, targetView: "photos", showAssistantIdleBeforePhotos: true, assistantIdleSeconds: 10 },
});

export const overlayPositionSchema = z.enum([
  "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right",
]);

export const settingsSchema = z.object({
  photoIntervalSeconds: z.number().int().min(10).max(3600),
  transitionSeconds: z.number().min(0.3).max(5),
  viewBrightness: z.object({
    photos: z.number().min(0.05).max(1).default(0.75),
    ha: z.number().min(0.05).max(1).default(0.85),
    "assistant-expressive": z.number().min(0.05).max(1).default(0.65),
  }).default({ photos: 0.75, ha: 0.85, "assistant-expressive": 0.65 }),
  viewRouter: viewRouterSettingsSchema,
  assistantBrightness: assistantBrightnessSchema,
  overlay: z.object({
    position: overlayPositionSchema,
    showClock: z.boolean(),
    showDate: z.boolean(),
    showWeather: z.boolean(),
    showHomeAssistantPlaceholder: z.boolean(),
    weatherLocation: z.object({
      label: z.string().max(80),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
    }),
  }),
});

export type WallDeckSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: WallDeckSettings = {
  photoIntervalSeconds: 30,
  transitionSeconds: 1.4,
  viewBrightness: { photos: 0.75, ha: 0.85, "assistant-expressive": 0.65 },
  assistantBrightness: { globalEnabled: true, overrides: { sleep: .05 } },
  viewRouter: {
    tapAction: { enabled: true, sourceView: "photos", targetView: "ha" },
    swipeDownAction: { enabled: true, sourceView: "photos", targetView: "ha" },
    inactivityAction: { enabled: true, sourceView: "ha", seconds: 30, targetView: "photos", showAssistantIdleBeforePhotos: true, assistantIdleSeconds: 10 },
  },
  overlay: {
    position: "bottom-left",
    showClock: true,
    showDate: true,
    showWeather: true,
    showHomeAssistantPlaceholder: false,
    weatherLocation: { label: "Dom", latitude: null, longitude: null },
  },
};

export interface PhotoItem {
  id: string;
  url: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
}

export interface WeatherNow {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  isDay: boolean;
  label: string;
  observedAt: string;
}

export const homeAssistantOverlayItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  entityId: z.string().trim().min(1).max(255).regex(/^[a-z0-9_]+\.[a-z0-9_]+$/i),
  label: z.string().trim().max(80),
  position: overlayPositionSchema,
});

export type HomeAssistantOverlayItem = z.infer<typeof homeAssistantOverlayItemSchema>;

export const homeAssistantConfigInputSchema = z.object({
  baseUrl: z.string().trim().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Dozwolony jest tylko adres HTTP lub HTTPS"),
  token: z.string().max(8192).optional(),
  dashboardUrl: z.string().trim().max(2048).refine((value) => value === "" || z.string().url().safeParse(value).success, "Nieprawidłowy adres dashboardu"),
  overlayEntities: z.array(homeAssistantOverlayItemSchema).max(24).default([]),
  co2EntityId: z.string().trim().max(255).nullable().optional(),
});

export type HomeAssistantConfigInput = z.infer<typeof homeAssistantConfigInputSchema>;

export interface HomeAssistantStatus {
  configured: boolean;
  connected: boolean;
  baseUrl: string;
  dashboardUrl: string;
  overlayEntities: HomeAssistantOverlayItem[];
  version: string | null;
  entityCount: number;
  lastError: string | null;
}

export interface HomeAssistantEntity {
  entityId: string;
  state: string;
  friendlyName: string;
  unit: string | null;
  deviceClass: string | null;
  lastChanged: string | null;
}

export interface HomeAssistantSelectedState {
  id: string;
  entityId: string;
  state: string;
  friendlyName: string;
  label: string;
  position: z.infer<typeof overlayPositionSchema>;
  unit: string | null;
  updatedAt: string | null;
}
