import type { AssistantState, WallDeckSettings } from "@walldeck/contracts";

export function assistantBrightness(settings: WallDeckSettings, state: AssistantState): number {
  const override = settings.assistantBrightness.overrides[state];
  if (override != null) return override;
  return settings.assistantBrightness.globalEnabled ? settings.viewBrightness["assistant-expressive"] : -1;
}
