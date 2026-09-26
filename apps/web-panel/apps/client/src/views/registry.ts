import type { ComponentType } from "react";
import type { ViewId } from "@walldeck/contracts";
import { PhotoAlbumView } from "./PhotoAlbumView";
import { HomeAssistantView } from "./HomeAssistantView";

export const viewRegistry: Record<ViewId, ComponentType> = {
  photos: PhotoAlbumView,
  ha: HomeAssistantView,
};
