import { useEffect, useState, type FormEvent } from "react";
import { openAiVoiceSchema, type AiAssistantConversationEntry, type AiAssistantRunResult, type AiAssistantStatus, type ElevenLabsVoice, type WallDeckSettings } from "@walldeck/contracts";
import { api } from "./api";

type Props = { page: "ai" | "voice" | "console" | "history"; settings: WallDeckSettings; setSettings(value: WallDeckSettings): void };

export function AiAssistantAdmin({ page, settings, setSettings }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [connection, setConnection] = useState<AiAssistantStatus>({
    configured: false,
    elevenLabsConfigured: false,
    enabled: false,
    toolsReady: false,
    mcpReady: false,
    busy: false,
    voiceUsage: { month: "", liveSeconds: 0, estimatedUsd: 0, budgetUsd: 15, remainingUsd: 15, exhausted: false, fallbackActive: false },
    speakerObservation: null,
    speakerObserver: { available: false, engine: "silero-ecapa", modelReady: false },
  });
  const [message, setMessage] = useState("");
  const [forceFallback, setForceFallback] = useState(false);
  const [result, setResult] = useState<AiAssistantRunResult | null>(null);
  const [state, setState] = useState("Ładowanie…");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<AiAssistantConversationEntry[]>([]);
  const config = settings.aiAssistant;

  useEffect(() => {
    api.assistant.config().then(({ settings: next, status }) => {
      setSettings({ ...settings, aiAssistant: next });
      setConnection(status);
      setState("Gotowe");
      if (status.elevenLabsConfigured) void loadElevenLabsVoices();
    }).catch((error) => setState(error instanceof Error ? error.message : String(error)));
  // Initial synchronization only; settings is deliberately not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => api.assistant.history().then((entries) => { if (active) setHistory(entries); }).catch(() => undefined);
    void refresh();
    const timer = setInterval(refresh, 3_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  function update(patch: Partial<WallDeckSettings["aiAssistant"]>) {
    setSettings({ ...settings, aiAssistant: { ...config, ...patch } });
  }

  async function loadElevenLabsVoices() {
    try {
      const response = await api.assistant.elevenLabsVoices();
      setElevenLabsVoices(response.voices);
      setState(`ElevenLabs · ${response.voices.length} dostępnych głosów`);
    } catch (error) {
      setState(`ElevenLabs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setState("Zapisywanie…");
    try {
      const saved = await api.assistant.save({ settings: config, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(elevenLabsApiKey.trim() ? { elevenLabsApiKey: elevenLabsApiKey.trim() } : {}) });
      setSettings({ ...settings, aiAssistant: saved.settings });
      setConnection(saved.status);
      setApiKey("");
      setElevenLabsApiKey("");
      setState("Konfiguracja zapisana");
      if (saved.status.elevenLabsConfigured) void loadElevenLabsVoices();
    } catch (error) { setState(`Błąd: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setRunning(true); setResult(null); setState("Asystent pracuje…");
    try {
      const next = await api.assistant.run({ message: message.trim(), forceFallback, recordHistory: true });
      setResult(next); setState(`Gotowe · ${next.durationMs} ms`); setHistory(await api.assistant.history());
    } catch (error) { setState(`Błąd: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setRunning(false); }
  }

  async function testVoice() {
    setState("Generowanie próbki głosu…");
    try {
      const sample = await api.assistant.speech("Dzień dobry. Tu Waldek. Jestem gotowy pomóc w domu.");
      const url = URL.createObjectURL(sample.blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      const refreshed = await api.assistant.config();
      setConnection(refreshed.status);
      const provider = sample.provider === "openai-live" ? "GPT-Live" : sample.provider === "openai-tts-fallback" ? "TTS · fallback" : sample.provider === "elevenlabs" ? "ElevenLabs" : "OpenAI TTS";
      setState(`Odtwarzam próbkę · ${provider}${sample.liveSeconds ? ` · ${sample.liveSeconds.toFixed(1)} s sesji` : ""}`);
    } catch (error) { setState(`Błąd: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async function switchConversationMode(mode: WallDeckSettings["aiAssistant"]["voice"]["conversationMode"]) {
    if (mode === config.voice.conversationMode || running) return;
    setRunning(true);
    setState(`Przełączanie na ${mode === "gpt-live" ? "GPT-Live" : "Lunę"}…`);
    try {
      const next = { ...config, voice: { ...config.voice, conversationMode: mode } };
      const saved = await api.assistant.save({ settings: next });
      setSettings({ ...settings, aiAssistant: saved.settings });
      setConnection(saved.status);
      setState(`Aktywny tryb: ${mode === "gpt-live" ? "GPT-Live" : "Luna + MCP + TTS"}`);
    } catch (error) {
      setState(`Błąd przełączania: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function clearHistory() {
    await api.assistant.clearHistory();
    setHistory([]);
    setState("Historia rozmów wyczyszczona");
  }

  return <section className="ai-admin">
    <article hidden={page !== "ai"} className="admin-card ai-status-card">
      <div><span className="admin-kicker">OPENAI + WALLDECK</span><h2>Asystent tekstowy</h2><p>Polecenie trafia do wybranego modelu, a działania są wykonywane przez wspólny katalog narzędzi. Publiczny endpoint MCP można włączać niezależnie.</p></div>
      <div className="ai-status-grid">
        <span className={connection.configured ? "is-ready" : ""}><i />Klucz API<strong>{connection.configured ? "zapisany" : "brak"}</strong></span>
        <span className={connection.toolsReady ? "is-ready" : ""}><i />Narzędzia<strong>{connection.toolsReady ? "gotowe" : "wyłączone"}</strong></span>
        <span className={config.enabled ? "is-ready" : ""}><i />Asystent<strong>{config.enabled ? "aktywny" : "wyłączony"}</strong></span>
      </div>
    </article>

    <article hidden={page !== "voice"} className="admin-card ai-mode-switcher">
      <div><span className="admin-kicker">AKTYWNY TOR ROZMOWY</span><h2>Tryb asystenta</h2><p>Zmiana działa natychmiast. Ustawienia obu torów pozostają zachowane.</p></div>
      <div className="ai-mode-options" role="group" aria-label="Tryb rozmowy asystenta">
        <button type="button" className={config.voice.conversationMode === "gpt-live" ? "is-active" : ""} aria-pressed={config.voice.conversationMode === "gpt-live"} disabled={running} onClick={() => void switchConversationMode("gpt-live")}><strong>GPT‑Live</strong><small>rozmowa audio–audio</small></button>
        <button type="button" className={config.voice.conversationMode === "luna-pipeline" ? "is-active" : ""} aria-pressed={config.voice.conversationMode === "luna-pipeline"} disabled={running} onClick={() => void switchConversationMode("luna-pipeline")}><strong>Luna</strong><small>STT · MCP · ElevenLabs</small></button>
      </div>
      <output>{state}</output>
    </article>

    <form hidden={page !== "ai" && page !== "voice"} className="admin-card admin-form ai-config" onSubmit={save}>
      <div className="admin-model-settings" hidden={page !== "ai"}>
      <div><span className="admin-kicker">KONFIGURACJA</span><h2>Modele i eskalacja</h2></div>
      <label className="switch-row"><input type="checkbox" checked={config.enabled} onChange={(e) => update({ enabled: e.target.checked })} /><span><strong>Włącz asystenta AI</strong><small>Konsola pozostaje zablokowana, dopóki ta opcja jest wyłączona.</small></span></label>
      <div className="ai-model-grid">
        <label>Model podstawowy<input value={config.primaryModel} onChange={(e) => update({ primaryModel: e.target.value })} /></label>
        <label>Rozumowanie<select value={config.primaryReasoning} onChange={(e) => update({ primaryReasoning: e.target.value as typeof config.primaryReasoning })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
        <label>Model mocniejszy<input value={config.fallbackModel} onChange={(e) => update({ fallbackModel: e.target.value })} /></label>
        <label>Rozumowanie<select value={config.fallbackReasoning} onChange={(e) => update({ fallbackReasoning: e.target.value as typeof config.fallbackReasoning })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
      </div>
      <label className="switch-row"><input type="checkbox" checked={config.escalationEnabled} onChange={(e) => update({ escalationEnabled: e.target.checked })} /><span><strong>Automatyczna eskalacja</strong><small>Mocniejszy model może zostać użyty najwyżej raz dla polecenia, po błędzie albo jawnej prośbie modelu podstawowego.</small></span></label>
      <label>Maksymalna liczba tur modelu<input type="number" min="2" max="12" value={config.maxTurns} onChange={(e) => update({ maxTurns: Number(e.target.value) })} /></label>
      <label>Instrukcja systemowa<textarea rows={6} value={config.systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })} /></label>
      <label>Klucz OpenAI API<input type="password" autoComplete="off" placeholder={connection.configured ? "Zapisany — pozostaw puste, aby go zachować" : "sk-…"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} /><small>Klucz jest szyfrowany na serwerze i nie wraca do przeglądarki.</small></label>
      </div>
      <fieldset hidden={page !== "voice"} className="ai-voice-settings"><legend>Głos i rozmowa</legend>
        <label className="switch-row"><input type="checkbox" checked={config.voice.enabled} onChange={(e) => update({ voice: { ...config.voice, enabled: e.target.checked } })} /><span><strong>Włącz generowanie mowy</strong><small>Na tym etapie próbka gra wyłącznie w przeglądarce administratora.</small></span></label>
        <label>Tryb rozmowy na tablecie<select value={config.voice.conversationMode} onChange={(e) => update({ voice: { ...config.voice, conversationMode: e.target.value as typeof config.voice.conversationMode } })}>
          <option value="gpt-live">GPT-Live · szybka rozmowa audio–audio</option>
          <option value="luna-pipeline">Luna · transkrypcja, MCP i TTS</option>
        </select><small>Zmiana trybu nie usuwa jego ustawień. Po zapisaniu następne „Ej Waldek” użyje wybranej ścieżki.</small></label>
        <label>Dostawca głosu próbki i fallbacku<select value={config.voice.provider} onChange={(e) => update({ voice: { ...config.voice, provider: e.target.value as typeof config.voice.provider } })}>
          <option value="openai-live">GPT-Live · naturalna rozmowa</option>
          <option value="openai-tts">OpenAI TTS · oszczędny</option>
          <option value="elevenlabs">ElevenLabs</option>
        </select></label>
        {config.voice.conversationMode === "gpt-live" && <div className="ai-live-settings">
          <details className="admin-disclosure"><summary>Model, głos i limity GPT-Live</summary><div>
          <div className="ai-usage-meter"><header><strong>Budżet GPT-Live · {connection.voiceUsage.month || "bieżący miesiąc"}</strong><span>${connection.voiceUsage.estimatedUsd.toFixed(3)} / ${config.voice.live.monthlyBudgetUsd.toFixed(2)}</span></header><progress max={config.voice.live.monthlyBudgetUsd} value={Math.min(connection.voiceUsage.estimatedUsd, config.voice.live.monthlyBudgetUsd)} /><small>{connection.voiceUsage.exhausted ? "Limit osiągnięty — aktywny jest fallback TTS." : `Pozostało około $${connection.voiceUsage.remainingUsd.toFixed(2)} · ${connection.voiceUsage.liveSeconds.toFixed(1)} s sesji Live.`}</small></div>
          <div className="ai-model-grid">
            <label>Model Live<input value={config.voice.live.model} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, model: e.target.value } } })} /></label>
            <label>Głos Live<select value={config.voice.live.voice} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, voice: e.target.value as typeof config.voice.live.voice } } })}>{openAiVoiceSchema.options.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>
            <label>Limit miesięczny (USD)<input type="number" min="1" max="500" step="1" value={config.voice.live.monthlyBudgetUsd} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, monthlyBudgetUsd: Number(e.target.value) } } })} /></label>
            <label>Twardy limit sesji<input type="number" min="10" max="120" step="1" value={config.voice.live.hardLimitSeconds} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, hardLimitSeconds: Number(e.target.value) } } })} /><small>sekund</small></label>
            <label>Zamknięcie po ciszy<input type="number" min="750" max="10000" step="250" value={config.voice.live.idleCloseMs} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, idleCloseMs: Number(e.target.value) } } })} /><small>ms po ostatnim fragmencie audio</small></label>
          </div>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.fallbackToTts} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, fallbackToTts: e.target.checked } } })} /><span><strong>Po limicie lub błędzie przejdź na OpenAI TTS</strong><small>Próbka i przyszłe odpowiedzi nadal będą działały z modelem ustawionym niżej.</small></span></label>
          </div></details>
          <article className="admin-note">
            <strong>Rozmowa na tablecie</strong>
            <p>Wake word działa lokalnie. Dopiero po jego wykryciu tablet wysyła dźwięk rozmowy do GPT-Live. Zwykłe odpowiedzi wracają bezpośrednio jako audio, dlatego osobne narzędzie „speak” nie jest potrzebne.</p>
          </article>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.conversationEnabled} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, conversationEnabled: e.target.checked } } })} /><span><strong>Włącz rozmowę GPT-Live na tablecie</strong><small>Uruchamia natywny tor mikrofon → WallDeck Server → GPT-Live → głośnik tabletu.</small></span></label>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.wakeWordEnabled} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, wakeWordEnabled: e.target.checked } } })} /><span><strong>Nasłuchuj lokalnego wake wordu</strong><small>Android używa wyłącznie lokalnego recognizera; brak lokalnego silnika nie uruchamia wariantu chmurowego.</small></span></label>
          <label>Fraza wybudzająca<input value={config.voice.live.wakePhrase} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, wakePhrase: e.target.value } } })} /></label>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.speakerObservationEnabled} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, speakerObservationEnabled: e.target.checked } } })} /><span><strong>Eksperymentalnie obserwuj mówcę</strong><small>Homelab używa Silero VAD i ECAPA-TDNN. Wynik pozostaje diagnostyczny i nie wpływa jeszcze na pamięć, uprawnienia ani narzędzia.</small></span></label>
          <p className="admin-note"><strong>Silnik mówcy:</strong> {connection.speakerObserver.available && connection.speakerObserver.modelReady ? "Silero + ECAPA gotowy" : "niedostępny"}{connection.speakerObserver.detail ? ` · ${connection.speakerObserver.detail}` : ""}</p>
          {connection.speakerObservation && <p className="admin-note"><strong>Ostatnia obserwacja:</strong> {connection.speakerObservation.label} · {(connection.speakerObservation.confidence * 100).toFixed(0)}%{typeof connection.speakerObservation.similarity === "number" ? ` · podobieństwo ${(connection.speakerObservation.similarity * 100).toFixed(0)}%` : ""}{typeof connection.speakerObservation.processingMs === "number" ? ` · ${connection.speakerObservation.processingMs.toFixed(0)} ms` : ""} · {new Date(connection.speakerObservation.observedAt).toLocaleString("pl-PL")}</p>}
        </div>}
        {config.voice.conversationMode === "luna-pipeline" && <div className="ai-live-settings">
          <article className="admin-note"><strong>Ścieżka Luna</strong><p>Wake word → lokalny Silero/ECAPA → transkrypcja OpenAI → model podstawowy i MCP → OpenAI TTS → głośnik tabletu. GPT-Live pozostaje dostępny po zmianie przełącznika.</p></article>
          <div className="ai-model-grid">
            <label>Model transkrypcji<input value={config.voice.pipeline.transcriptionModel} onChange={(e) => update({ voice: { ...config.voice, pipeline: { ...config.voice.pipeline, transcriptionModel: e.target.value } } })} /></label>
            <label>Koniec wypowiedzi<input type="number" min="750" max="5000" step="250" value={config.voice.pipeline.endOfTurnMs} onChange={(e) => update({ voice: { ...config.voice, pipeline: { ...config.voice.pipeline, endOfTurnMs: Number(e.target.value) } } })} /><small>ms bez aktywnego mówcy</small></label>
            <label>Maksymalna długość polecenia<input type="number" min="5" max="45" step="1" value={config.voice.pipeline.maxInputSeconds} onChange={(e) => update({ voice: { ...config.voice, pipeline: { ...config.voice.pipeline, maxInputSeconds: Number(e.target.value) } } })} /><small>sekund</small></label>
          </div>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.conversationEnabled} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, conversationEnabled: e.target.checked } } })} /><span><strong>Włącz rozmowę Luna na tablecie</strong><small>Po rozpoznaniu wypowiedzi Luna korzysta z tych samych narzędzi MCP co konsola tekstowa.</small></span></label>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.wakeWordEnabled} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, wakeWordEnabled: e.target.checked } } })} /><span><strong>Nasłuchuj lokalnego wake wordu</strong><small>Dźwięk jest wysyłany do serwera dopiero po wykryciu frazy na tablecie.</small></span></label>
          <label>Fraza wybudzająca<input value={config.voice.live.wakePhrase} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, wakePhrase: e.target.value } } })} /></label>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.speakerObservationEnabled} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, speakerObservationEnabled: e.target.checked } } })} /><span><strong>Śledź aktywnego mówcę</strong><small>Silero i ECAPA pomagają zakończyć wypowiedź mimo dźwięku telewizora lub muzyki. Wynik nadal nie nadaje uprawnień.</small></span></label>
          <p className="admin-note"><strong>Silnik mówcy:</strong> {connection.speakerObserver.available && connection.speakerObserver.modelReady ? "Silero + ECAPA gotowy" : "niedostępny"}{connection.speakerObserver.detail ? ` · ${connection.speakerObserver.detail}` : ""}</p>
        </div>}
        {config.voice.provider === "elevenlabs" && <div className="ai-live-settings">
          <p className="admin-note"><strong>ElevenLabs:</strong> {connection.elevenLabsConfigured ? "klucz zapisany" : "brak klucza"}. Lista pokazuje głosy dostępne dla Twojego konta; najlepiej wybrać głos zweryfikowany dla polskiego.</p>
          <label>Klucz ElevenLabs API<input type="password" autoComplete="off" placeholder={connection.elevenLabsConfigured ? "Zapisany — pozostaw puste, aby go zachować" : "xi-api-key"} value={elevenLabsApiKey} onChange={(e) => setElevenLabsApiKey(e.target.value)} /><small>Klucz jest szyfrowany na serwerze i nie jest zwracany do przeglądarki.</small></label>
          <div className="ai-model-grid">
            <label>Model ElevenLabs<select value={config.voice.elevenLabs.model} onChange={(e) => update({ voice: { ...config.voice, elevenLabs: { ...config.voice.elevenLabs, model: e.target.value } } })}><option value="eleven_multilingual_v2">Multilingual v2 · naturalny</option><option value="eleven_flash_v2_5">Flash v2.5 · szybki</option><option value="eleven_turbo_v2_5">Turbo v2.5 · balans</option><option value="eleven_v3">Eleven v3 · ekspresyjny</option></select></label>
            <label>Głos<select value={config.voice.elevenLabs.voiceId} onChange={(e) => update({ voice: { ...config.voice, elevenLabs: { ...config.voice.elevenLabs, voiceId: e.target.value } } })}><option value="">Wybierz głos…</option>{config.voice.elevenLabs.voiceId && !elevenLabsVoices.some(voice => voice.voiceId === config.voice.elevenLabs.voiceId) && <option value={config.voice.elevenLabs.voiceId}>Zapisany Voice ID</option>}{elevenLabsVoices.map(voice => <option key={voice.voiceId} value={voice.voiceId}>{voice.name}{voice.verifiedLanguages.includes("pl") ? " · polski" : voice.labels.accent ? ` · ${voice.labels.accent}` : ""}</option>)}</select></label>
          </div>
          <button type="button" className="secondary" disabled={!connection.elevenLabsConfigured} onClick={() => void loadElevenLabsVoices()}>Odśwież listę głosów</button>
        </div>}
        <details className="admin-disclosure"><summary>OpenAI TTS · głos zapasowy i sposób mówienia</summary><div>
        <div className="ai-model-grid">
          <label>Model fallback TTS<input value={config.voice.model} onChange={(e) => update({ voice: { ...config.voice, model: e.target.value } })} /></label>
          <label>Głos fallback TTS<select value={config.voice.voice} onChange={(e) => update({ voice: { ...config.voice, voice: e.target.value as typeof config.voice.voice } })}>{openAiVoiceSchema.options.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>
        </div>
        <label>Sposób mówienia<input value={config.voice.instructions} onChange={(e) => update({ voice: { ...config.voice, instructions: e.target.value } })} /></label>
        </div></details>
        <button type="button" className="secondary" disabled={!config.voice.enabled || (config.voice.provider === "elevenlabs" ? !connection.elevenLabsConfigured || !config.voice.elevenLabs.voiceId : !connection.configured)} onClick={testVoice}>Odtwórz próbkę tutaj</button>
      </fieldset>
      <footer><button type="submit">Zapisz konfigurację</button><span>{state}</span></footer>
    </form>

    <form hidden={page !== "console"} className="admin-card ai-console" onSubmit={submit}>
      <div><span className="admin-kicker">KONSOLA</span><h2>Wpisz polecenie</h2></div>
      <textarea aria-label="Polecenie dla asystenta" rows={4} placeholder="Np. pokaż stan WallDeck albo wyszukaj playlistę reggae" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="ai-console-actions"><label className="switch-row"><input type="checkbox" checked={forceFallback} onChange={(e) => setForceFallback(e.target.checked)} /><span><strong>Od razu użyj mocniejszego modelu</strong></span></label><button disabled={running || !config.enabled || !connection.configured || !connection.toolsReady}>{running ? "Pracuję…" : "Wykonaj"}</button></div>
      {result && <div className="ai-result"><header><strong>{result.model}</strong><span>{result.escalated ? "eskalacja" : "model podstawowy"}</span></header><p>{result.text}</p>{result.toolCalls.length > 0 && <details><summary>Wywołania narzędzi ({result.toolCalls.length})</summary>{result.toolCalls.map((tool, index) => <article key={`${tool.name}-${index}`}><strong>{tool.name}</strong><code>{JSON.stringify(tool.arguments, null, 2)}</code>{tool.output !== undefined && <code>{JSON.stringify(tool.output, null, 2)}</code>}</article>)}</details>}</div>}
    </form>

    <section hidden={page !== "history"} className="admin-card ai-history">
      <header><div><span className="admin-kicker">HISTORIA</span><h2>Rozmowy i działania</h2><p>Ostatnie 100 sesji GPT‑Live, Luny i konsoli wraz z narzędziami oraz fingerprintem mówcy. Audio i klucze API nie są zapisywane.</p></div><button type="button" className="secondary" disabled={!history.length} onClick={() => void clearHistory()}>Wyczyść historię</button></header>
      {!history.length && <p className="admin-note">Brak zapisanych rozmów. Następne polecenie „Ej Waldek…” pojawi się tutaj automatycznie.</p>}
      <div className="ai-history-list">{history.map((entry) => <ConversationEntry key={entry.id} entry={entry} />)}</div>
    </section>
  </section>;
}

function ConversationEntry({ entry }: { entry: AiAssistantConversationEntry }) {
  const live = entry.liveSession;
  const sourceLabel = entry.source === "tablet-live" ? "Tablet · GPT‑Live" : entry.source === "tablet-voice" ? "Tablet · Luna" : "Admin · tekst";
  const durationMs = live?.durationMs ?? entry.result?.durationMs ?? 0;
  const fingerprints = live ? [...new Map(live.speakerObservations.filter(item => item.fingerprintId).map(item => [item.fingerprintId, item])).values()] : [];
  return <article className="ai-history-entry">
    <header><div><strong>{sourceLabel}</strong><time>{new Date(entry.startedAt).toLocaleString("pl-PL")}</time></div><span className={entry.error ? "is-error" : "is-ok"}>{entry.error ? "błąd" : durationMs >= 1_000 ? `${(durationMs / 1_000).toFixed(1)} s` : `${durationMs} ms`}</span></header>
    {!live && <div className="ai-history-message"><small>Rozpoznano / wpisano</small><p>{entry.transcript || "Nie uzyskano transkrypcji"}</p></div>}
    {live && <>
      <div className="ai-live-history-meta"><span><small>MODEL</small>{live.model}</span><span><small>ZUŻYCIE</small>{live.usageSeconds.toFixed(1)} s</span><span><small>ZAKOŃCZENIE</small>{live.closeReason}</span><span><small>SESJA</small>{live.sessionId?.slice(-12) ?? "—"}</span></div>
      <section className="ai-live-timeline" aria-label="Pełna transkrypcja GPT-Live">
        <h3>Przebieg rozmowy</h3>
        {!live.transcript.length && <p className="admin-note">Brak czytelnej transkrypcji.</p>}
        {live.transcript.map((segment, index) => <article className={segment.role === "user" ? "is-user" : "is-assistant"} key={`${entry.id}-segment-${index}`}>
          <small>{segment.role === "user" ? "Użytkownik" : "GPT‑Live"} · {(segment.startMs / 1_000).toFixed(1)}–{(segment.endMs / 1_000).toFixed(1)} s{segment.interrupted ? " · przerwana odpowiedź" : ""}</small>
          <p>{segment.text}</p>
        </article>)}
      </section>
      <details className="ai-live-trace">
        <summary>Działania i narzędzia ({live.toolCalls.length + live.delegations.length + live.delegations.reduce((sum, item) => sum + item.toolCalls.length, 0)})</summary>
        <div className="ai-history-turn">
          {live.toolCalls.map((tool, index) => <section className="ai-history-tool" key={`${tool.callId}-${index}`}><small>Narzędzie Live · {tool.name}</small><label>Argumenty</label><pre>{JSON.stringify(tool.arguments, null, 2)}</pre><label>Wynik</label><pre>{JSON.stringify(tool.output, null, 2)}</pre>{tool.error && <><label>Błąd</label><pre>{tool.error}</pre></>}</section>)}
          {live.delegations.map((delegation, index) => <section className="ai-history-tool" key={`${delegation.delegationId ?? "fallback"}-${index}`}><small>Delegacja do Responses{delegation.model ? ` · ${delegation.model}` : ""}</small><label>Wynik przekazany do GPT‑Live</label><pre>{delegation.result}</pre>{delegation.error && <><label>Błąd</label><pre>{delegation.error}</pre></>}{delegation.toolCalls.map((tool, toolIndex) => <div className="ai-live-nested-tool" key={`${tool.name}-${toolIndex}`}><strong>{tool.name}</strong><label>Argumenty</label><pre>{JSON.stringify(tool.arguments, null, 2)}</pre>{tool.output !== undefined && <><label>Wynik</label><pre>{JSON.stringify(tool.output, null, 2)}</pre></>}</div>)}</section>)}
          {!live.toolCalls.length && !live.delegations.length && <p className="admin-note">Ta rozmowa nie wywołała narzędzi.</p>}
        </div>
      </details>
      <details className="ai-live-trace">
        <summary>Fingerprint mówcy ({fingerprints.length})</summary>
        <div className="ai-speaker-history">
          {!live.speakerObservations.length && <p className="admin-note">Obserwacja mówcy była wyłączona albo próbka była zbyt krótka.</p>}
          {live.speakerObservations.map((observation, index) => <article key={`${observation.observedAt}-${index}`}><strong>{observation.label}</strong><code>{observation.fingerprintId ?? "brak fingerprintu"}</code><span>{(observation.confidence * 100).toFixed(0)}% pewności{typeof observation.similarity === "number" ? ` · ${(observation.similarity * 100).toFixed(0)}% podobieństwa` : ""}</span><time>{new Date(observation.observedAt).toLocaleTimeString("pl-PL")}</time></article>)}
          <p className="admin-note">Identyfikator jest anonimowym podpisem próbki ECAPA. Nie nadaje uprawnień ani nie oznacza jeszcze rozpoznanej osoby.</p>
        </div>
      </details>
    </>}
    {entry.result?.modelTurns.map((turn, turnIndex) => <details key={`${entry.id}-${turnIndex}`} >
      <summary>{turn.model} · wejście, odpowiedź i narzędzia ({turn.toolCalls.length})</summary>
      <div className="ai-history-turn">
        <section><small>Instrukcja systemowa</small><pre>{turn.instructions}</pre></section>
        <section><small>Dokładne wejście do modelu</small><pre>{turn.input}</pre></section>
        {turn.output && <section><small>Odpowiedź modelu</small><pre>{turn.output}</pre></section>}
        {turn.error && <section className="is-error"><small>Błąd modelu</small><pre>{turn.error}</pre></section>}
        {turn.toolCalls.map((tool, index) => <section className="ai-history-tool" key={`${tool.name}-${index}`}><small>Narzędzie MCP · {tool.name}</small><label>Argumenty</label><pre>{JSON.stringify(tool.arguments, null, 2)}</pre>{tool.output !== undefined && <><label>Wynik</label><pre>{JSON.stringify(tool.output, null, 2)}</pre></>}</section>)}
      </div>
    </details>)}
    {entry.result && <div className="ai-history-message ai-history-final"><small>Tekst końcowy przekazany do głosu</small><p>{entry.result.text}</p></div>}
    {entry.error && <p className="ai-history-error">{entry.error}</p>}
  </article>;
}
