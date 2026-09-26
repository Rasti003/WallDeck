import { z } from "zod";

export const viewIdSchema = z.enum(["photos"]);
export type ViewId = z.infer<typeof viewIdSchema>;

export const overlayPositionSchema = z.enum([
  "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right",
]);

export const settingsSchema = z.object({
  photoIntervalSeconds: z.number().int().min(10).max(3600),
  transitionSeconds: z.number().min(0.3).max(5),
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
