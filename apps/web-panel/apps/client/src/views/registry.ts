import type { ComponentType } from "react";
import type { ViewId } from "@walldeck/contracts";
import { PhotoAlbumView } from "./PhotoAlbumView";

export const viewRegistry: Record<ViewId, ComponentType> = {
  photos: PhotoAlbumView,
};
