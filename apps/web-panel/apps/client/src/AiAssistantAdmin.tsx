import { useEffect, useState, type FormEvent } from "react";
import { openAiVoiceSchema, type AiAssistantRunResult, type AiAssistantStatus, type ElevenLabsVoice, type WallDeckSettings } from "@walldeck/contracts";
import { api } from "./api";

type Props = { settings: WallDeckSettings; setSettings(value: WallDeckSettings): void };

export function AiAssistantAdmin({ settings, setSettings }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [connection, setConnection] = useState<AiAssistantStatus>({
    configured: false,
    elevenLabsConfigured: false,
    enabled: false,
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
      const next = await api.assistant.run({ message: message.trim(), forceFallback });
      setResult(next); setState(`Gotowe · ${next.durationMs} ms`);
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

  return <section className="ai-admin">
    <article className="admin-card ai-status-card">
      <div><span className="admin-kicker">OPENAI + WALLDECK MCP</span><h2>Asystent tekstowy</h2><p>Polecenie trafia do wybranego modelu, a działania są wykonywane przez narzędzia MCP konfigurowane niżej na tej stronie.</p></div>
      <div className="ai-status-grid">
        <span className={connection.configured ? "is-ready" : ""}><i />Klucz API<strong>{connection.configured ? "zapisany" : "brak"}</strong></span>
        <span className={connection.mcpReady ? "is-ready" : ""}><i />MCP<strong>{connection.mcpReady ? "gotowe" : "wyłączone"}</strong></span>
        <span className={config.enabled ? "is-ready" : ""}><i />Asystent<strong>{config.enabled ? "aktywny" : "wyłączony"}</strong></span>
      </div>
    </article>

    <form className="admin-card admin-form ai-config" onSubmit={save}>
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
      <fieldset className="ai-voice-settings"><legend>Opcjonalny głos</legend>
        <label className="switch-row"><input type="checkbox" checked={config.voice.enabled} onChange={(e) => update({ voice: { ...config.voice, enabled: e.target.checked } })} /><span><strong>Włącz generowanie mowy</strong><small>Na tym etapie próbka gra wyłącznie w przeglądarce administratora.</small></span></label>
        <label>Tryb rozmowy na tablecie<select value={config.voice.conversationMode} onChange={(e) => update({ voice: { ...config.voice, conversationMode: e.target.value as typeof config.voice.conversationMode } })}>
          <option value="gpt-live">GPT-Live · szybka rozmowa audio–audio</option>
          <option value="luna-pipeline">Luna · transkrypcja, MCP i TTS</option>
        </select><small>Zmiana trybu nie usuwa jego ustawień. Po zapisaniu następne „Ej Waldek” użyje wybranej ścieżki.</small></label>
        <label>Dostawca głosu próbki i fallbacku<select value={config.voice.provider} onChange={(e) => update({ voice: { ...config.voice, provider: e.target.value as typeof config.voice.provider } })}>
          <option value="openai-live">GPT-Live · naturalna rozmowa</option>
          <option value="openai-tts">OpenAI TTS · oszczędny</option>
          <option value="elevenlabs">ElevenLabs · przygotowane, jeszcze nieaktywne</option>
        </select></label>
        {config.voice.conversationMode === "gpt-live" && <div className="ai-live-settings">
          <div className="ai-usage-meter"><header><strong>Budżet GPT-Live · {connection.voiceUsage.month || "bieżący miesiąc"}</strong><span>${connection.voiceUsage.estimatedUsd.toFixed(3)} / ${config.voice.live.monthlyBudgetUsd.toFixed(2)}</span></header><progress max={config.voice.live.monthlyBudgetUsd} value={Math.min(connection.voiceUsage.estimatedUsd, config.voice.live.monthlyBudgetUsd)} /><small>{connection.voiceUsage.exhausted ? "Limit osiągnięty — aktywny jest fallback TTS." : `Pozostało około $${connection.voiceUsage.remainingUsd.toFixed(2)} · ${connection.voiceUsage.liveSeconds.toFixed(1)} s sesji Live.`}</small></div>
          <div className="ai-model-grid">
            <label>Model Live<input value={config.voice.live.model} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, model: e.target.value } } })} /></label>
            <label>Głos Live<select value={config.voice.live.voice} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, voice: e.target.value as typeof config.voice.live.voice } } })}>{openAiVoiceSchema.options.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>
            <label>Limit miesięczny (USD)<input type="number" min="1" max="500" step="1" value={config.voice.live.monthlyBudgetUsd} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, monthlyBudgetUsd: Number(e.target.value) } } })} /></label>
            <label>Twardy limit sesji<input type="number" min="10" max="120" step="1" value={config.voice.live.hardLimitSeconds} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, hardLimitSeconds: Number(e.target.value) } } })} /><small>sekund</small></label>
            <label>Zamknięcie po ciszy<input type="number" min="750" max="10000" step="250" value={config.voice.live.idleCloseMs} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, idleCloseMs: Number(e.target.value) } } })} /><small>ms po ostatnim fragmencie audio</small></label>
          </div>
          <label className="switch-row"><input type="checkbox" checked={config.voice.live.fallbackToTts} onChange={(e) => update({ voice: { ...config.voice, live: { ...config.voice.live, fallbackToTts: e.target.checked } } })} /><span><strong>Po limicie lub błędzie przejdź na OpenAI TTS</strong><small>Próbka i przyszłe odpowiedzi nadal będą działały z modelem ustawionym niżej.</small></span></label>
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
        <div className="ai-model-grid">
          <label>Model fallback TTS<input value={config.voice.model} onChange={(e) => update({ voice: { ...config.voice, model: e.target.value } })} /></label>
          <label>Głos fallback TTS<select value={config.voice.voice} onChange={(e) => update({ voice: { ...config.voice, voice: e.target.value as typeof config.voice.voice } })}>{openAiVoiceSchema.options.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>
        </div>
        <label>Sposób mówienia<input value={config.voice.instructions} onChange={(e) => update({ voice: { ...config.voice, instructions: e.target.value } })} /></label>
        <button type="button" className="secondary" disabled={!config.voice.enabled || (config.voice.provider === "elevenlabs" ? !connection.elevenLabsConfigured || !config.voice.elevenLabs.voiceId : !connection.configured)} onClick={testVoice}>Odtwórz próbkę tutaj</button>
      </fieldset>
      <footer><button type="submit">Zapisz konfigurację</button><span>{state}</span></footer>
    </form>

    <form className="admin-card ai-console" onSubmit={submit}>
      <div><span className="admin-kicker">KONSOLA</span><h2>Wpisz polecenie</h2></div>
      <textarea aria-label="Polecenie dla asystenta" rows={4} placeholder="Np. pokaż stan WallDeck albo wyszukaj playlistę reggae" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="ai-console-actions"><label className="switch-row"><input type="checkbox" checked={forceFallback} onChange={(e) => setForceFallback(e.target.checked)} /><span><strong>Od razu użyj mocniejszego modelu</strong></span></label><button disabled={running || !config.enabled || !connection.configured || !connection.mcpReady}>{running ? "Pracuję…" : "Wykonaj"}</button></div>
      {result && <div className="ai-result"><header><strong>{result.model}</strong><span>{result.escalated ? "eskalacja" : "model podstawowy"}</span></header><p>{result.text}</p>{result.toolCalls.length > 0 && <details><summary>Wywołania MCP ({result.toolCalls.length})</summary>{result.toolCalls.map((tool, index) => <article key={`${tool.name}-${index}`}><strong>{tool.name}</strong><code>{JSON.stringify(tool.arguments, null, 2)}</code>{tool.output !== undefined && <code>{JSON.stringify(tool.output, null, 2)}</code>}</article>)}</details>}</div>}
    </form>
  </section>;
}
