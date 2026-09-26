import { z } from "zod";

export const assistantStates = ["idle", "attention", "listening", "thinking", "speaking", "success", "error", "sleep", "curious", "uncertain", "confirm", "surprised", "wink", "laughing"] as const;
export const assistantStateSchema = z.enum(assistantStates);
export type AssistantState = z.infer<typeof assistantStateSchema>;
export const assistantBrightnessSchema = z.object({
  globalEnabled: z.boolean().default(true),
  overrides: z.partialRecord(assistantStateSchema, z.number().min(.05).max(1).nullable()).default({ sleep: .05 }),
}).default({ globalEnabled: true, overrides: { sleep: .05 } });

export const ambientSleepSchema = z.object({
  enabled: z.boolean(),
  sleepBelowLux: z.number().min(0).max(10_000),
  resetAboveLux: z.number().min(0).max(10_000),
  cameraEnabled: z.boolean().default(true),
  cameraSleepBelowPercent: z.number().min(0).max(100).default(5),
  cameraResetAbovePercent: z.number().min(0).max(100).default(15),
  cameraSampleSeconds: z.number().int().min(10).max(300).default(30),
}).refine((value) => value.resetAboveLux > value.sleepBelowLux, {
  message: "Próg wybudzenia musi być wyższy od progu snu",
  path: ["resetAboveLux"],
}).refine((value) => value.cameraResetAbovePercent > value.cameraSleepBelowPercent, {
  message: "Próg wybudzenia kamery musi być wyższy od progu snu",
  path: ["cameraResetAbovePercent"],
}).default({ enabled: true, sleepBelowLux: 5, resetAboveLux: 15, cameraEnabled: true, cameraSleepBelowPercent: 5, cameraResetAbovePercent: 15, cameraSampleSeconds: 30 });

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
  ambientSleep: ambientSleepSchema,
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
  ambientSleep: { enabled: true, sleepBelowLux: 5, resetAboveLux: 15, cameraEnabled: true, cameraSleepBelowPercent: 5, cameraResetAbovePercent: 15, cameraSampleSeconds: 30 },
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

export const deviceSensorSchema = z.object({
  name: z.string().max(160),
  vendor: z.string().max(160),
  type: z.number().int(),
  stringType: z.string().max(200),
  version: z.number().int(),
  reportingMode: z.number().int(),
  wakeUp: z.boolean(),
  power: z.number().finite(),
  resolution: z.number().finite(),
  maximumRange: z.number().finite(),
  minDelayUs: z.number().int(),
  maxDelayUs: z.number().int(),
  fifoMaxEventCount: z.number().int().nonnegative(),
  fifoReservedEventCount: z.number().int().nonnegative(),
  requiredPermission: z.string().max(200).nullable(),
  value: z.number().finite().nullable().optional(),
  unit: z.string().max(32).nullable().optional(),
});

export type DeviceSensor = z.infer<typeof deviceSensorSchema>;

export const deviceReportSchema = z.object({
  deviceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  manufacturer: z.string().max(160),
  model: z.string().max(160),
  android: z.string().max(80),
  sdk: z.number().int().positive(),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    densityDpi: z.number().int().positive(),
  }),
  appVersion: z.object({ name: z.string().max(80), code: z.number().int().nonnegative() }),
  battery: z.object({ percent: z.number().int().min(-1).max(100), powerConnected: z.boolean(), charging: z.boolean() }),
  permissions: z.object({
    overlay: z.boolean(),
    notifications: z.boolean(),
    microphone: z.boolean(),
    camera: z.boolean(),
    activityRecognition: z.boolean(),
  }),
  sensors: z.array(deviceSensorSchema).max(128),
});

export type DeviceReport = z.infer<typeof deviceReportSchema>;
export type DeviceStatus = DeviceReport & { lastSeen: string; online: boolean };
