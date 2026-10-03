import { z } from "zod";
import { mcpToolIdSchema, mcpToolIds, type McpToolId } from "@walldeck/contracts";
import type { FunctionTool } from "openai/resources/live/live";
import {
  assistantToolDefinitions,
  enabledAssistantToolIds,
  executeAssistantTool,
  type AssistantToolDependencies,
} from "./assistant-tools.js";

export type LiveToolDependencies = AssistantToolDependencies;

export function liveTools(enabled: Record<McpToolId, boolean>): FunctionTool[] {
  return enabledAssistantToolIds(enabled).filter(id => id !== "speak_on_tablet" && id !== "start_live_conversation").map(id => {
    const definition = assistantToolDefinitions[id];
    const { $schema: _schema, ...parameters } = z.toJSONSchema(definition.input);
    return {
      type: "function",
      name: id,
      description: definition.description,
      strict: false,
      parameters: parameters as FunctionTool["parameters"],
    };
  });
}

export async function executeLiveTool(name: string, rawArguments: string, deps: LiveToolDependencies, enabled?: Record<McpToolId, boolean>): Promise<unknown> {
  const id = mcpToolIdSchema.parse(name);
  if (id === "speak_on_tablet" || id === "start_live_conversation") throw new Error("Aktywna rozmowa ma już własny kanał głosowy");
  const switches = enabled ?? Object.fromEntries(mcpToolIds.map(toolId => [toolId, true])) as Record<McpToolId, boolean>;
  return executeAssistantTool(id, JSON.parse(rawArguments) as unknown, deps, switches);
}
