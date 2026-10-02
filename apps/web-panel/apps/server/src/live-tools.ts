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
  return enabledAssistantToolIds(enabled).map(id => {
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
  const switches = enabled ?? Object.fromEntries(mcpToolIds.map(toolId => [toolId, true])) as Record<McpToolId, boolean>;
  return executeAssistantTool(id, JSON.parse(rawArguments) as unknown, deps, switches);
}
