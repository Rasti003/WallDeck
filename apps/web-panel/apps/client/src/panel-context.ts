import { createContext } from "react";
import { defaultSettings, type AssistantState, type ScheduledItem, type ViewId, type WallDeckSettings } from "@walldeck/contracts";

export type SchedulePresentation = Pick<ScheduledItem, "id" | "kind"> & { revision: number };

export const PanelContext = createContext<{ settings: WallDeckSettings; activeView: ViewId; requestedAssistantState: AssistantState | null; voiceStatus: string; schedulePresentation: SchedulePresentation | null; menuOpen: boolean; stayOnThisView: boolean; setStayOnThisView: (stay: boolean) => void; setInteractionLocked: (locked: boolean) => void }>({ settings: defaultSettings, activeView: "photos", requestedAssistantState: null, voiceStatus: "", schedulePresentation: null, menuOpen: false, stayOnThisView: false, setStayOnThisView: () => undefined, setInteractionLocked: () => undefined });
