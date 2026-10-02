import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";
import type { FastifyInstance } from "fastify";
import type { AiAssistantSettings, McpToolId } from "@walldeck/contracts";
import type { LiveVoiceUsageStore } from "./live-voice.js";
import { executeLiveTool, liveTools, type LiveToolDependencies } from "./live-tools.js";
import type { SpeakerObservation } from "@walldeck/contracts";
import type { SpeakerObserverClient, SpeakerObservationSession } from "./speaker-observer.js";

type Dependencies = LiveToolDependencies & {
  getApiKey(): Promise<string | null>;
  getSettings(): Promise<AiAssistantSettings>;
  getEnabledTools(): Promise<Record<McpToolId, boolean>>;
  usage: LiveVoiceUsageStore;
  speakerObserver: SpeakerObserverClient;
  onSpeakerObservation(observation: SpeakerObservation): void;
};

type ClientMessage =
  | { type: "audio"; audio: string }
  | { type: "delegation.result"; delegationId: string | null; content: string }
  | { type: "context"; content: string }
  | { type: "close" };

const PCM_RATE = 24_000;
const OUTPUT_GENERATION_GRACE_MS = 2_500;
const NATURAL_PAUSE_MS = 500;
const FOLLOW_UP_WINDOW_MS = 12_000;
const HARD_LIMIT_FINISH_GRACE_MS = 30_000;
const ACTIVE_TURN_GRACE_MS = 3_000;
const DELEGATION_GRACE_MS = 35_000;

function containsAudiblePcm(pcm: Buffer): boolean {
  if (pcm.length < 2) return false;
  let total = 0;
  let samples = 0;
  for (let offset = 0; offset + 1 < pcm.length; offset += 32) {
    total += Math.abs(pcm.readInt16LE(offset));
    samples += 1;
  }
  return samples > 0 && total / samples >= 90;
}

export function registerLiveConversation(app: FastifyInstance, deps: Dependencies) {
  let active = false;
  app.get("/api/assistant/live", { websocket: true }, async (socket, request) => {
    const query = request.query as { initial?: unknown };
    const initialCommand = typeof query.initial === "string" ? query.initial.trim().slice(0, 500) : "";
    const origin = request.headers.origin;
    if (!origin || !request.headers.host || new URL(origin).host !== request.headers.host) {
      socket.send(JSON.stringify({ type: "error", error: "Nieprawidłowy origin rozmowy" }));
      socket.close();
      return;
    }
    if (active) {
      socket.send(JSON.stringify({ type: "error", error: "Inna rozmowa głosowa jest już aktywna" }));
      socket.close();
      return;
    }
    const settings = await deps.getSettings();
    const enabledTools = await deps.getEnabledTools();
    const key = await deps.getApiKey();
    const usage = await deps.usage.status(settings);
    if (!settings.enabled || !settings.voice.enabled || settings.voice.conversationMode !== "gpt-live" || !settings.voice.live.conversationEnabled) {
      socket.send(JSON.stringify({ type: "error", error: "Rozmowy GPT-Live są wyłączone" }));
      socket.close();
      return;
    }
    if (!key || usage.exhausted) {
      socket.send(JSON.stringify({ type: "error", error: key ? "Miesięczny limit GPT-Live został osiągnięty" : "Brak klucza OpenAI API" }));
      socket.close();
      return;
    }

    active = true;
    const client = new OpenAI({ apiKey: key });
    const live = new LiveWS(client, { reconnect: null });
    let startedAt = Date.now();
    let sessionStarted = false;
    let closeRequested = false;
    let closeReason = "transport-ended";
    let finalUsage = 0;
    let inputTranscript = "";
    let outputTranscript = "";
    let outputAudioBytes = 0;
    let audibleAudioBytes = 0;
    let droppedSilenceBytes = 0;
    let lastAudibleAt = 0;
    let lastTurnActivityAt = 0;
    const pendingAudio: string[] = [];
    let outputPlaybackUntil = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    let delegationTimer: ReturnType<typeof setTimeout> | undefined;
    let hardGraceDeadline = 0;
    let awaitingDelegationResponse = false;
    const pendingDelegations = new Set<string>();
    const delegationsNeedingContinuation = new Set<string>();
    let speakerSession: SpeakerObservationSession | null = settings.voice.live.speakerObservationEnabled
      ? deps.speakerObserver.session(
        observation => deps.onSpeakerObservation(observation),
        error => app.log.warn({ err: error }, "Local speaker observation failed"),
      )
      : null;

    const send = (message: unknown) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(message));
    };
    const requestClose = (reason = "requested") => {
      if (closeRequested) return;
      closeRequested = true;
      closeReason = reason;
      if (sessionStarted) live.send({ type: "session.close", event_id: `close_${Date.now()}` });
      else live.close({ code: 1000, reason: "WallDeck closed before start" });
    };
    const postponeIdleClose = (byteCount: number) => {
      const durationMs = byteCount / (PCM_RATE * 2) * 1_000;
      outputPlaybackUntil = Math.max(Date.now(), outputPlaybackUntil) + durationMs;
      if (idleTimer) clearTimeout(idleTimer);
      const queuedPlaybackMs = Math.max(0, outputPlaybackUntil - Date.now());
      // GPT-Live has no event marking the end of a spoken response. A pause between
      // audio deltas is not an end-of-turn signal, so keep enough generation grace
      // to avoid closing a session in the middle of a sentence.
      idleTimer = setTimeout(
        () => requestClose("output-idle"),
        Math.max(OUTPUT_GENERATION_GRACE_MS, queuedPlaybackMs + Math.max(settings.voice.live.idleCloseMs, FOLLOW_UP_WINDOW_MS)),
      );
    };
    const waitForDelegation = (delegationId?: string | null) => {
      if (delegationId) pendingDelegations.add(delegationId);
      awaitingDelegationResponse = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (delegationTimer) clearTimeout(delegationTimer);
      delegationTimer = setTimeout(() => requestClose("delegation-timeout"), DELEGATION_GRACE_MS);
    };
    const delegationAnswered = () => {
      if (pendingDelegations.size > 0) return;
      awaitingDelegationResponse = false;
      if (delegationTimer) clearTimeout(delegationTimer);
      delegationTimer = undefined;
    };
    const closeAtHardLimit = () => {
      const now = Date.now();
      const activeTurn = awaitingDelegationResponse || outputPlaybackUntil > now || now - lastTurnActivityAt <= ACTIVE_TURN_GRACE_MS;
      if (activeTurn && now < hardGraceDeadline) {
        hardTimer = setTimeout(closeAtHardLimit, Math.min(1_000, hardGraceDeadline - now));
        return;
      }
      requestClose("hard-limit");
    };

    socket.on("message", (raw: Buffer) => {
      if (raw.length > 180_000) return;
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        if (message.type === "audio" && typeof message.audio === "string" && message.audio.length <= 160_000 && !closeRequested) {
          const pcm = speakerSession ? Buffer.from(message.audio, "base64") : null;
          if (pcm?.length) speakerSession?.append(pcm);
          if (sessionStarted) {
            live.send({ type: "session.input_audio.append", event_id: `audio_${Date.now()}`, audio: message.audio });
          } else {
            pendingAudio.push(message.audio);
            if (pendingAudio.length > 50) pendingAudio.shift();
          }
        } else if (message.type === "delegation.result" && typeof message.content === "string" && message.content.length <= 4_000 && !closeRequested) {
          if (message.delegationId) pendingDelegations.delete(message.delegationId);
          lastTurnActivityAt = Date.now();
          waitForDelegation();
          app.log.info({ delegationId: message.delegationId, resultLength: message.content.length }, "GPT-Live delegation result received");
          live.send({ type: "session.commentary.append", event_id: `result_${Date.now()}`, delegation_id: message.delegationId, content: message.content });
        } else if (message.type === "context" && typeof message.content === "string" && message.content.length <= 2_000 && !closeRequested) {
          live.send({ type: "session.instructions.append", event_id: `context_${Date.now()}`, delegation_id: null, content: message.content });
        } else if (message.type === "close") requestClose("client-playback-complete");
      } catch { /* Ignore malformed audio transport messages. */ }
    });
    socket.on("close", () => requestClose("client-socket-closed"));

    try {
      for await (const envelope of live) {
        if (envelope.type === "open") {
          startedAt = Date.now();
          const hardLimitMs = settings.voice.live.hardLimitSeconds * 1_000;
          hardGraceDeadline = startedAt + hardLimitMs + HARD_LIMIT_FINISH_GRACE_MS;
          hardTimer = setTimeout(closeAtHardLimit, hardLimitMs);
          live.send({
            type: "session.start",
            event_id: `start_${Date.now()}`,
            session: {
              model: settings.voice.live.model,
              store: false,
              instructions: `${settings.voice.instructions}
Język i styl: Rozmawiaj wyłącznie po polsku, naturalnie i zwięźle. Odpowiadaj głosem bezpośrednio na zwykłe pytania i swobodną rozmowę. Jeżeli startowy input kończy się wiadomością użytkownika, odpowiedz na nią natychmiast po uruchomieniu sesji.
Backchannel policy: Nie deleguj prostych odpowiedzi, powitań, krótkich wyjaśnień ani wiedzy, którą znasz. Możesz krótko powiedzieć, że sprawdzasz, gdy backend rzeczywiście pracuje.
Interruption policy: Słuchaj także podczas mówienia. Gdy użytkownik zacznie mówić lub Cię poprawi, przerwij obecną wypowiedź, wysłuchaj go i odpowiedz na najnowszą intencję.
Delegation policy: Deleguj do klienta tylko zadania wymagające narzędzi WallDeck/MCP, Spotify, Home Assistant, aktualnych danych, działania w systemie, pamięci albo wyraźnie trudniejszego rozumowania. Po otrzymaniu wyniku delegacji przedstaw go naturalnie użytkownikowi.
Music policy: Prośba typu „wybierz mi muzykę do nauki i puść” jest kompletna: deleguj wybór oraz uruchomienie Spotify bez pytania o konkretną playlistę. Nigdy nie twierdź, że wykonujesz lub wykonałeś akcję, jeśli nie utworzyłeś delegacji i nie otrzymałeś jej wyniku.`,
              input: initialCommand ? [{ type: "message", role: "user", content: [{ type: "input_text", text: initialCommand }] }] : [],
              audio: { format: { type: "audio/pcm", rate: PCM_RATE }, output: { voice: settings.voice.live.voice } },
              delegation: {
                type: "responses",
                responses: {
                  model: settings.primaryModel,
                  instructions: `${settings.systemPrompt}\nJesteś backendem narzędziowym rozmowy głosowej. Masz pełny kontekst rozmowy. Wykonuj proste, zatwierdzone działania od razu. Krótkie odpowiedzi typu „tak” interpretuj w kontekście ostatniego pytania asystenta. Raportuj sukces dopiero po potwierdzeniu narzędzia.`,
                  tools: [...liveTools(enabledTools), { type: "web_search" as const }],
                  tool_choice: "auto",
                  parallel_tool_calls: false,
                  reasoning: { effort: settings.primaryReasoning },
                  text: { verbosity: "low" },
                  max_output_tokens: 500,
                },
              },
            },
          });
          continue;
        }
        if (envelope.type === "error") throw envelope.error;
        if (envelope.type !== "message") continue;
        const event = envelope.message;
        if (event.type === "response.event") {
          const delegationId = event.delegation_id ?? null;
          const nested = event.event as { type?: unknown; item?: { type?: unknown; call_id?: unknown; name?: unknown; arguments?: unknown } };
          if (nested.type === "response.output_item.done" && nested.item?.type === "function_call" && delegationId
            && typeof nested.item.call_id === "string" && typeof nested.item.name === "string" && typeof nested.item.arguments === "string") {
            waitForDelegation(delegationId);
            let output: unknown;
            try {
              output = await executeLiveTool(nested.item.name, nested.item.arguments, deps, enabledTools);
              app.log.info({ delegationId, tool: nested.item.name }, "GPT-Live tool completed");
            } catch (error) {
              output = { ok: false, error: error instanceof Error ? error.message : String(error) };
              app.log.warn({ delegationId, tool: nested.item.name, err: error }, "GPT-Live tool failed");
            }
            live.send({
              type: "response.item.create",
              event_id: `tool_result_${Date.now()}`,
              item: { type: "function_call_output", call_id: nested.item.call_id, output: JSON.stringify(output) },
            });
            delegationsNeedingContinuation.add(delegationId);
          } else if (nested.type === "response.completed" && delegationId) {
            if (delegationsNeedingContinuation.delete(delegationId)) {
              live.send({ type: "response.create", event_id: `continue_${Date.now()}` });
            } else {
              pendingDelegations.delete(delegationId);
            }
          }
          continue;
        }
        if (event.type === "session.started") {
          sessionStarted = true;
          pendingAudio.splice(0).forEach((audio, index) => {
            live.send({ type: "session.input_audio.append", event_id: `buffered_${Date.now()}_${index}`, audio });
          });
          send({ type: "ready", sessionId: event.session.id, sampleRate: PCM_RATE });
        } else if (event.type === "session.input_transcript.delta") {
          if (idleTimer) clearTimeout(idleTimer);
          lastTurnActivityAt = Date.now();
          inputTranscript += event.delta;
          send({ type: "inputTranscript", delta: event.delta, startMs: event.start_ms, endMs: event.end_ms });
        } else if (event.type === "session.output_transcript.delta") {
          delegationAnswered();
          lastTurnActivityAt = Date.now();
          outputTranscript += event.delta;
          send({ type: "outputTranscript", delta: event.delta, startMs: event.start_ms, endMs: event.end_ms });
        } else if (event.type === "session.output_audio.delta") {
          delegationAnswered();
          lastTurnActivityAt = Date.now();
          const pcm = Buffer.from(event.delta, "base64");
          const audible = containsAudiblePcm(pcm);
          outputAudioBytes += pcm.length;
          if (audible) {
            lastAudibleAt = Date.now();
            audibleAudioBytes += pcm.length;
            send({ type: "audio", audio: event.delta });
            postponeIdleClose(pcm.length);
          } else if (lastAudibleAt && Date.now() - lastAudibleAt <= NATURAL_PAUSE_MS) {
            send({ type: "audio", audio: event.delta });
          } else {
            droppedSilenceBytes += pcm.length;
          }
        } else if (event.type === "session.delegation.created") {
          waitForDelegation(event.delegation.id);
          app.log.info({ delegationId: event.delegation.id, target: event.delegation.target, offsetMs: event.offset_ms }, "GPT-Live delegation created");
          if (event.delegation.target === "client") send({ type: "delegation", delegationId: event.delegation.id, offsetMs: event.offset_ms });
        } else if (event.type === "session.usage.updated") {
          finalUsage = Math.max(finalUsage, event.usage.seconds);
          send({ type: "usage", seconds: finalUsage });
        } else if (event.type === "session.closed") {
          finalUsage = Math.max(finalUsage, event.usage?.seconds ?? 0);
          send({ type: "closed", seconds: finalUsage });
          break;
        } else if (event.type === "error") {
          throw new Error(event.error?.message ?? "GPT-Live zwrócił błąd");
        }
      }
    } catch (error) {
      app.log.error({ err: error }, "GPT-Live conversation failed");
      send({ type: "error", error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      if (delegationTimer) clearTimeout(delegationTimer);
      const finalSpeakerSession = speakerSession;
      speakerSession = null;
      if (finalSpeakerSession) await finalSpeakerSession.finish();
      live.close({ code: 1000, reason: "WallDeck conversation finished" });
      if (sessionStarted) {
        finalUsage = finalUsage || Math.max(0, (Date.now() - startedAt) / 1_000);
        await deps.usage.add(finalUsage);
      }
      app.log.info({
        closeReason,
        durationMs: Date.now() - startedAt,
        inputTranscript,
        outputTranscript,
        outputAudioBytes,
        audibleAudioBytes,
        droppedSilenceBytes,
        usageSeconds: finalUsage,
      }, "GPT-Live conversation summary");
      active = false;
      if (socket.readyState === 1) socket.close();
    }
  });
}
