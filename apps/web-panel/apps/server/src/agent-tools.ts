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
      errorFunction: null,
    });
  });
}
