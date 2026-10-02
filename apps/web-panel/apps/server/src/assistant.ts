import { Agent, MCPServerStreamableHttp, OpenAIProvider, Runner, type RunItem } from "@openai/agents";
import type { AiAssistantRunResult, AiAssistantSettings, AiAssistantToolTrace } from "@walldeck/contracts";

const escalationMarker = /^\s*ESCALATE\s*:\s*/i;

function safeJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}

export function collectToolTrace(items: RunItem[]): AiAssistantToolTrace[] {
  const calls = new Map<string, AiAssistantToolTrace>();
  for (const item of items) {
    if (item.type === "tool_call_item" && item.rawItem.type === "function_call") {
      calls.set(item.rawItem.callId, { name: item.rawItem.name, arguments: safeJson(item.rawItem.arguments) });
    } else if (item.type === "tool_call_output_item" && item.rawItem.type === "function_call_result") {
      const call = calls.get(item.rawItem.callId);
      if (call) call.output = typeof item.output === "string" ? safeJson(item.output) : item.output;
    }
  }
  return [...calls.values()];
}

export interface AssistantServiceOptions {
  mcpUrl: string;
  mcpToken: string;
  getApiKey(): Promise<string | null>;
}

export class AssistantService {
  private running = false;

  constructor(private readonly options: AssistantServiceOptions) {}

  get busy() { return this.running; }

  async execute(message: string, settings: AiAssistantSettings, forceFallback = false): Promise<AiAssistantRunResult> {
    if (this.running) throw new Error("Asystent wykonuje już inną komendę");
    const apiKey = await this.options.getApiKey();
    if (!apiKey) throw new Error("Najpierw zapisz klucz OpenAI API");
    if (!settings.enabled) throw new Error("Asystent AI jest wyłączony");
    if (!this.options.mcpToken) throw new Error("Brakuje WALLDECK_MCP_TOKEN");

    this.running = true;
    const started = Date.now();
    try {
      const primaryModel = forceFallback ? settings.fallbackModel : settings.primaryModel;
      const primaryReasoning = forceFallback ? settings.fallbackReasoning : settings.primaryReasoning;
      try {
        const first = await this.runOnce(message, settings, apiKey, primaryModel, primaryReasoning);
        const requestsEscalation = escalationMarker.test(first.text);
        if (!forceFallback && requestsEscalation && settings.escalationEnabled) {
          const second = await this.runOnce(`${message}\n\nModel podstawowy poprosił o eskalację. Rozwiąż polecenie samodzielnie.`, settings, apiKey, settings.fallbackModel, settings.fallbackReasoning);
          return { ...second, escalated: true, durationMs: Date.now() - started };
        }
        return { ...first, text: first.text.replace(escalationMarker, ""), escalated: forceFallback, durationMs: Date.now() - started };
      } catch (error) {
        if (forceFallback || !settings.escalationEnabled) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        const second = await this.runOnce(`${message}\n\nModel podstawowy nie ukończył zadania: ${reason}. Spróbuj je wykonać.`, settings, apiKey, settings.fallbackModel, settings.fallbackReasoning);
        return { ...second, escalated: true, durationMs: Date.now() - started };
      }
    } finally {
      this.running = false;
    }
  }

  private async runOnce(message: string, settings: AiAssistantSettings, apiKey: string, model: string, reasoning: AiAssistantSettings["primaryReasoning"]): Promise<AiAssistantRunResult> {
    const mcp = new MCPServerStreamableHttp({
      url: this.options.mcpUrl,
      name: "WallDeck",
      cacheToolsList: false,
      timeout: 15_000,
      requestInit: { headers: { authorization: `Bearer ${this.options.mcpToken}` } },
    });
    const provider = new OpenAIProvider({ apiKey });
    try {
      await mcp.connect();
      const agent = new Agent({
        name: "WallDeck Assistant",
        instructions: settings.systemPrompt,
        model,
        modelSettings: { reasoning: { effort: reasoning }, store: false },
        mcpServers: [mcp],
        mcpConfig: { convertSchemasToStrict: true, errorFunction: null },
      });
      const runner = new Runner({ modelProvider: provider, tracingDisabled: true, traceIncludeSensitiveData: false });
      const result = await runner.run(agent, message, {
        maxTurns: settings.maxTurns,
      });
      const text = typeof result.finalOutput === "string" ? result.finalOutput.trim() : "";
      if (!text) throw new Error("Model nie zwrócił odpowiedzi");
      return { text, model, escalated: false, toolCalls: collectToolTrace(result.newItems), durationMs: 0 };
    } finally {
      await mcp.close().catch(() => undefined);
      await provider.close().catch(() => undefined);
    }
  }
}
