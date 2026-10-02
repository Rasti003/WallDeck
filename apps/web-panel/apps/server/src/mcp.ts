import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { WallDeckSettings } from "@walldeck/contracts";
import {
  assistantToolDefinitions,
  assistantToolTitle,
  enabledAssistantToolIds,
  executeAssistantTool,
  type AssistantToolDependencies,
} from "./assistant-tools.js";

export type WallDeckMcpDependencies = AssistantToolDependencies;

const textResult = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

export function createWallDeckMcpServer(settings: WallDeckSettings, deps: WallDeckMcpDependencies) {
  const server = new McpServer(
    { name: "WallDeck", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: "Steruj jednym domowym panelem WallDeck. Używaj odczytów przed zmianami, nie zgaduj identyfikatorów encji i nie powtarzaj komend bez potrzeby." },
  );
  const enabled = settings.mcp.tools;

  for (const id of enabledAssistantToolIds(enabled)) {
    const definition = assistantToolDefinitions[id];
    server.registerTool(id, {
      title: assistantToolTitle(id),
      description: definition.description,
      inputSchema: definition.input.shape,
      annotations: definition.annotations,
    }, async (raw: Record<string, unknown>) => textResult(await executeAssistantTool(id, raw, deps, enabled)));
  }

  return server;
}

function sameToken(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerMcpEndpoint(app: FastifyInstance, deps: WallDeckMcpDependencies, token: string | undefined) {
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      const settings = await deps.readSettings();
      if (!settings.mcp.enabled) return reply.code(404).send({ error: "MCP jest wyłączone" });
      if (!token) return reply.code(503).send({ error: "MCP nie ma skonfigurowanego tokenu" });
      const authorization = request.headers.authorization ?? "";
      const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!sameToken(token, supplied)) return reply.header("WWW-Authenticate", "Bearer").code(401).send({ error: "Brak dostępu" });

      const server = createWallDeckMcpServer(settings, deps);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack();
      reply.raw.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  });
}
