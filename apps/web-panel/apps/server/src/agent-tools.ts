import { tool, type Tool } from "@openai/agents";
import type { McpToolId } from "@walldeck/contracts";
import { assistantToolDefinitions, enabledAssistantToolIds, executeAssistantTool, type AssistantToolDependencies } from "./assistant-tools.js";

export function createAssistantAgentTools(deps: AssistantToolDependencies, enabled: Record<McpToolId, boolean>): Tool[] {
  return enabledAssistantToolIds(enabled).map(id => {
    const definition = assistantToolDefinitions[id];
    return tool({
      name: id,
      description: definition.description,
      parameters: definition.input,
      execute: args => executeAssistantTool(id, args, deps, enabled),
      // Canvas is a presentation boundary, so malformed model-authored layout
      // should be returned to the model for correction instead of failing the
      // whole user request. Operational tools keep fail-fast behavior.
      ...(id === "show_assistant_canvas" ? {} : { errorFunction: null }),
    });
  });
}
