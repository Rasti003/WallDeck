import type { ComponentType } from "react";
import type { ViewId } from "@walldeck/contracts";
import { PhotoAlbumView } from "./PhotoAlbumView";
import { HomeAssistantView } from "./HomeAssistantView";
import { AssistantDemoView } from "./AssistantDemoView";

export const viewRegistry: Record<ViewId, ComponentType> = {
  photos: PhotoAlbumView,
  ha: HomeAssistantView,
  "assistant-demo": AssistantDemoView,
};
