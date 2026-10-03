import { Agent, OpenAIProvider, Runner, type RunItem, type Tool } from "@openai/agents";
import type { AiAssistantModelTurn, AiAssistantRunResult, AiAssistantSettings, AiAssistantToolTrace } from "@walldeck/contracts";

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
  getApiKey(): Promise<string | null>;
  getTools(): Promise<Tool[]>;
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
          return { ...second, modelTurns: [...first.modelTurns, ...second.modelTurns], escalated: true, durationMs: Date.now() - started };
        }
        return { ...first, text: first.text.replace(escalationMarker, ""), escalated: forceFallback, durationMs: Date.now() - started };
      } catch (error) {
        if (forceFallback || !settings.escalationEnabled) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        const second = await this.runOnce(`${message}\n\nModel podstawowy nie ukończył zadania: ${reason}. Spróbuj je wykonać.`, settings, apiKey, settings.fallbackModel, settings.fallbackReasoning);
        const failedTurn: AiAssistantModelTurn = { model: primaryModel, input: message, instructions: settings.systemPrompt, error: reason, toolCalls: [] };
        return { ...second, modelTurns: [failedTurn, ...second.modelTurns], escalated: true, durationMs: Date.now() - started };
      }
    } finally {
      this.running = false;
    }
  }

  private async runOnce(message: string, settings: AiAssistantSettings, apiKey: string, model: string, reasoning: AiAssistantSettings["primaryReasoning"]): Promise<AiAssistantRunResult> {
    const provider = new OpenAIProvider({ apiKey });
    try {
      const tools = await this.options.getTools();
      const instructions = `${settings.systemPrompt}\n\nGdy odpowiedź ma być pokazana na tablecie, użyj show_assistant_canvas. Pytania o temperatury, CO₂ lub inne pomiary Home Assistant przedstaw jako duże metrics. W metric pole value musi być tekstem. Chart wymaga co najmniej 2 dostępnych punktów liczbowych; przy jednym czujniku przekaż charts: []. Dla aktualnych informacji z internetu najpierw użyj search_web, a potem pokaż wynik w Canvas wraz ze źródłami i dostępnymi obrazami. Nie wymyślaj adresów URL ani wartości encji.`;
      const agent = new Agent({
        name: "WallDeck Assistant",
        instructions,
        model,
        modelSettings: { reasoning: { effort: reasoning }, store: false },
        tools,
      });
      const runner = new Runner({ modelProvider: provider, tracingDisabled: true, traceIncludeSensitiveData: false });
      const result = await runner.run(agent, message, {
        maxTurns: settings.maxTurns,
      });
      const text = typeof result.finalOutput === "string" ? result.finalOutput.trim() : "";
      if (!text) throw new Error("Model nie zwrócił odpowiedzi");
      const toolCalls = collectToolTrace(result.newItems);
      return { text, model, escalated: false, toolCalls, modelTurns: [{ model, input: message, instructions, output: text, toolCalls }], durationMs: 0 };
    } finally {
      await provider.close().catch(() => undefined);
    }
  }
}
