import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { assistantStates, type HomeAssistantEntity, type WallDeckSettings } from "@walldeck/contracts";
import { api } from "../api";
import { stateLabels } from "./assistant-state";
import { assistantBrightness } from "./brightness";

export function AssistantAdmin({ settings, setSettings, save, status }: {
  settings: WallDeckSettings;
  setSettings: Dispatch<SetStateAction<WallDeckSettings>>;
  save: (event: FormEvent) => Promise<void>;
  status: string;
}) {
  const global = settings.viewBrightness["assistant-expressive"];
  const enabled = settings.assistantBrightness.globalEnabled;
  const [entityQuery, setEntityQuery] = useState("");
  const [entities, setEntities] = useState<HomeAssistantEntity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<HomeAssistantEntity | null>(null);
  const [entityMessage, setEntityMessage] = useState("");
  const selectedEntityId = settings.ambientSleep.homeAssistantEntityId;

  useEffect(() => {
    const timer = setTimeout(() => {
      api.homeAssistant.entities(entityQuery).then((items) => {
        setEntities(items);
        setEntityMessage(items.length ? "" : "Nie znaleziono encji.");
      }).catch((error: Error) => setEntityMessage(error.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [entityQuery]);

  useEffect(() => {
    if (!selectedEntityId) { setSelectedEntity(null); return; }
    api.homeAssistant.entity(selectedEntityId).then(setSelectedEntity).catch(() => setSelectedEntity(null));
  }, [selectedEntityId]);

  const entityOptions = useMemo(() => {
    if (!selectedEntity || entities.some((entity) => entity.entityId === selectedEntity.entityId)) return entities;
    return [selectedEntity, ...entities];
  }, [entities, selectedEntity]);

  const setSource = (source: WallDeckSettings["ambientSleep"]["source"]) => setSettings(current => ({
    ...current,
    ambientSleep: { ...current.ambientSleep, source, cameraEnabled: source === "camera" },
  }));
  return <form className="admin-form assistant-admin" onSubmit={save}>
    <section className="admin-card">
      <span className="admin-kicker">Asystent</span><h2>Światło i mimika</h2>
      <p className="form-intro">Każda mina może mieć własną jasność ekranu tabletu. Zapisane zmiany są stosowane od razu, również podczas wyświetlania asystenta.</p>
      <label className="switch-row"><input type="checkbox" checked={enabled} onChange={e => setSettings(current => ({ ...current, assistantBrightness: { ...current.assistantBrightness, globalEnabled: e.target.checked } }))} /><span><strong>Wspólna jasność asystenta</strong><small>Po wyłączeniu miny bez własnego ustawienia używają jasności Androida.</small></span></label>
      <label className="brightness-control"><span><strong>Poziom wspólny</strong><output>{enabled ? `${Math.round(global * 100)}%` : "Android"}</output></span><input aria-label="Wspólna jasność asystenta" type="range" min="5" max="100" disabled={!enabled} value={Math.round(global * 100)} onChange={e => setSettings(current => ({ ...current, viewBrightness: { ...current.viewBrightness, "assistant-expressive": Number(e.target.value) / 100 } }))} /></label>
      <p className="form-intro">Własna jasność miny ma pierwszeństwo. „Sen” domyślnie używa 5%. Zakres 5–100% pozwala zachować widoczność sterowania.</p>
      <a href="/assistant-expressive" target="_blank" rel="noreferrer">Otwórz studio mimiki ↗</a>
    </section>
    <section className="admin-card">
      <span className="admin-kicker">Automatyzacja światła</span><h2>Sen po zmroku</h2>
      <p className="form-intro">Gdy tablet zgłosi niski poziom światła, WallDeck pokaże asystenta w stanie Sen. Dotknięcie śpiącej twarzy zawsze otwiera Home Assistant.</p>
      <label className="switch-row"><input type="checkbox" checked={settings.ambientSleep.enabled} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, enabled: e.target.checked } }))} /><span><strong>Włącz sen zależny od światła</strong><small>Drugi, wyższy próg zapobiega ciągłemu przełączaniu przy granicznej wartości.</small></span></label>
      <div className="entity-picker ambient-source-picker">
        <label>Źródło wartości<select value={settings.ambientSleep.source} onChange={e => setSource(e.target.value as WallDeckSettings["ambientSleep"]["source"])}>
          <option value="home-assistant">Encja Home Assistant</option>
          <option value="android-sensor">Sensor światła tabletu</option>
          <option value="camera">Przednia kamera (eksperymentalnie)</option>
        </select></label>
        <label>Spokojna twarz przed zaśnięciem<input type="number" min="0.3" max="10" step="0.1" value={settings.ambientSleep.sleepEntryDelaySeconds} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, sleepEntryDelaySeconds: Number(e.target.value) } }))} /><span>sekundy · zakres 0,3–10</span></label>
        {settings.ambientSleep.source === "home-assistant" && <>
          <label>Wyszukaj encję<input value={entityQuery} onChange={e => setEntityQuery(e.target.value)} placeholder="np. oświetlenie, lux, salon" /></label>
          <label>Encja<select value={selectedEntityId ?? ""} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, homeAssistantEntityId: e.target.value || null } }))}>
            <option value="">Wybierz encję…</option>
            {entityOptions.map(entity => <option key={entity.entityId} value={entity.entityId}>{entity.friendlyName} · {entity.state} {entity.unit ?? ""} ({entity.entityId})</option>)}
          </select></label>
          {selectedEntity && <p className="form-intro ambient-entity-state"><strong>Aktualnie:</strong> {selectedEntity.state} {selectedEntity.unit ?? ""} · {selectedEntity.friendlyName}</p>}
          {entityMessage && <p className="form-intro ambient-sleep-note">{entityMessage}</p>}
          <div className="field-grid ambient-sleep-fields">
            <label>Włącz Sen, gdy wartość ≤<input type="number" step="any" value={settings.ambientSleep.homeAssistantSleepBelow} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, homeAssistantSleepBelow: Number(e.target.value) } }))} /></label>
            <label>Uzbrój ponownie, gdy wartość ≥<input type="number" step="any" value={settings.ambientSleep.homeAssistantResetAbove} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, homeAssistantResetAbove: Number(e.target.value) } }))} /></label>
          </div>
          <p className="form-intro ambient-sleep-note">Encja musi zwracać liczbę. Stany „unknown” i „unavailable” są bezpiecznie pomijane.</p>
        </>}
        {settings.ambientSleep.source === "android-sensor" && <div className="field-grid ambient-sleep-fields">
          <label>Włącz Sen poniżej<input type="number" min="0" max="10000" step="1" value={settings.ambientSleep.sleepBelowLux} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, sleepBelowLux: Number(e.target.value) } }))} /><span>lux</span></label>
          <label>Uzbrój ponownie powyżej<input type="number" min="1" max="10000" step="1" value={settings.ambientSleep.resetAboveLux} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, resetAboveLux: Number(e.target.value) } }))} /><span>lux</span></label>
        </div>}
        {settings.ambientSleep.source === "camera" && <>
          <p className="form-intro ambient-sleep-note">Kamera wykonuje tylko krótkie pomiary jasności i pozostaje rozwiązaniem eksperymentalnym.</p>
          <div className="field-grid camera-light-fields">
            <label>Sen poniżej<input type="number" min="0" max="100" step="1" value={settings.ambientSleep.cameraSleepBelowPercent} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, cameraSleepBelowPercent: Number(e.target.value) } }))} /><span>% jasności obrazu</span></label>
            <label>Uzbrój ponownie powyżej<input type="number" min="1" max="100" step="1" value={settings.ambientSleep.cameraResetAbovePercent} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, cameraResetAbovePercent: Number(e.target.value) } }))} /><span>% jasności obrazu</span></label>
            <label>Pomiar co<input type="number" min="10" max="300" step="5" value={settings.ambientSleep.cameraSampleSeconds} onChange={e => setSettings(current => ({ ...current, ambientSleep: { ...current.ambientSleep, cameraSampleSeconds: Number(e.target.value) } }))} /><span>sekund</span></label>
          </div>
        </>}
      </div>
    </section>
    <section className="assistant-brightness-grid" aria-label="Jasność poszczególnych min">
      {assistantStates.map(state => {
        const override = settings.assistantBrightness.overrides[state];
        const custom = override != null;
        const value = custom ? override : global;
        const effective = assistantBrightness(settings, state);
        const change = (brightness: number | null) => setSettings(current => ({ ...current, assistantBrightness: { ...current.assistantBrightness, overrides: { ...current.assistantBrightness.overrides, [state]: brightness } } }));
        return <article className={`admin-card assistant-brightness-card ${custom ? "is-custom" : ""}`} key={state}>
          <header><h3>{stateLabels[state]}</h3><output>{effective === -1 ? "Android" : `${Math.round(effective * 100)}%`}</output></header>
          <label className="switch-row"><input aria-label={`Własna jasność: ${stateLabels[state]}`} type="checkbox" checked={custom} onChange={e => change(e.target.checked ? (state === "sleep" ? .05 : global) : null)} /><span>Własna jasność</span></label>
          <input aria-label={`Jasność: ${stateLabels[state]}`} type="range" min="5" max="100" disabled={!custom} value={Math.round(value * 100)} onChange={e => change(Number(e.target.value) / 100)} />
          <footer><small>{custom ? "Ustawienie tej miny" : enabled ? "Dziedziczy poziom wspólny" : "Steruje Android"}</small><a href={`/assistant-expressive?state=${state}`} target="_blank" rel="noreferrer" aria-label={`Podgląd: ${stateLabels[state]}`}>Podgląd ↗</a></footer>
        </article>;
      })}
    </section>
    <footer className="admin-card assistant-settings-save"><span role="status">{status}</span><button type="submit">Zapisz ustawienia asystenta</button></footer>
  </form>;
}
