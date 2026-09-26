import { createContext } from "react";
import { defaultSettings, type ViewId, type WallDeckSettings } from "@walldeck/contracts";

export const PanelContext = createContext<{ settings: WallDeckSettings; activeView: ViewId }>({ settings: defaultSettings, activeView: "photos" });
