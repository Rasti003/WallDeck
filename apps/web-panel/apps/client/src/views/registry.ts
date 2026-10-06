import { YoutubeView } from "./YoutubeView";
import type { ComponentType } from "react";
import type { ViewId } from "@walldeck/contracts";
import { PhotoAlbumView } from "./PhotoAlbumView";
import { HomeAssistantView } from "./HomeAssistantView";
import { AssistantDemoView } from "./AssistantDemoView";
import { MusicView } from "./MusicView";
import { ClockView } from "./ClockView";
import { AssistantCanvasView } from "./AssistantCanvasView";

export const viewRegistry: Record<ViewId, ComponentType> = {
  photos: PhotoAlbumView,
  ha: HomeAssistantView,
  music: MusicView,
  youtube: YoutubeView,
  "assistant-expressive": AssistantDemoView,
  "assistant-canvas": AssistantCanvasView,
  timers: ClockView,
};
