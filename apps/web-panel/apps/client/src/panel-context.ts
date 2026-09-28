import { createContext } from "react";
import { defaultSettings, type AssistantState, type ViewId, type WallDeckSettings } from "@walldeck/contracts";

export const PanelContext = createContext<{ settings: WallDeckSettings; activeView: ViewId; requestedAssistantState: AssistantState | null; menuOpen: boolean; setInteractionLocked: (locked: boolean) => void }>({ settings: defaultSettings, activeView: "photos", requestedAssistantState: null, menuOpen: false, setInteractionLocked: () => undefined });
