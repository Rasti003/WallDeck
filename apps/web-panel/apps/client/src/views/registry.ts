import type { ComponentType } from "react";
import type { ViewId } from "@walldeck/contracts";
import { PhotoAlbumView } from "./PhotoAlbumView";
import { HomeAssistantView } from "./HomeAssistantView";
import { AssistantDemoView } from "./AssistantDemoView";
import { MusicView } from "./MusicView";
import { ClockView } from "./ClockView";

export const viewRegistry: Record<ViewId, ComponentType> = {
  photos: PhotoAlbumView,
  ha: HomeAssistantView,
  music: MusicView,
  "assistant-expressive": AssistantDemoView,
  timers: ClockView,
};
