import { useEffect, useState, type FormEvent } from "react";
import {
  defaultSettings,
  type HomeAssistantEntity,
  type HomeAssistantOverlayItem,
  type HomeAssistantSelectedState,
  type HomeAssistantStatus,
  type ViewId,
  type WallDeckSettings,
} from "@walldeck/contracts";
import { api } from "./api";

const positions: { value: WallDeckSettings["overlay"]["position"]; label: string }[] = [
  { value: "top-left", label: "Góra — lewo" }, { value: "top-center", label: "Góra — środek" },
  { value: "top-right", label: "Góra — prawo" }, { value: "bottom-left", label: "Dół — lewo" },
  { value: "bottom-center", label: "Dół — środek" }, { value: "bottom-right", label: "Dół — prawo" },
];

export function AdminApp() {
  const [settings, setSettings] = useState<WallDeckSettings>(defaultSettings);
  const [views, setViews] = useState<{ current: ViewId; available: { id: ViewId; name: string }[] }>({ current: "photos", available: [] });
  const [photoCount, setPhotoCount] = useState(0);
  const [status, setStatus] = useState("Ładowanie…");
  const [haStatus, setHaStatus] = useState<HomeAssistantStatus | null>(null);
  const [haForm, setHaForm] = useState<{ baseUrl: string; token: string; dashboardUrl: string; overlayEntities: HomeAssistantOverlayItem[] }>({ baseUrl: "", token: "", dashboardUrl: "", overlayEntities: [] });
  const [haEntities, setHaEntities] = useState<HomeAssistantEntity[]>([]);
  const [haLiveStates, setHaLiveStates] = useState<HomeAssistantSelectedState[]>([]);
  const [haSearch, setHaSearch] = useState("");
  const [entityDraft, setEntityDraft] = useState<{ entityId: string; label: string; position: WallDeckSettings["overlay"]["position"] }>({ entityId: "", label: "", position: "bottom-right" });
  const [haMessage, setHaMessage] = useState("Nie skonfigurowano");
  const [section, setSection] = useState<"overview" | "views" | "photos" | "ha">("overview");

  useEffect(() => {
    Promise.all([api.settings(), api.views(), api.photos(), api.homeAssistant.config()]).then(([nextSettings, nextViews, photos, homeAssistant]) => {
      setSettings(nextSettings); setViews(nextViews); setPhotoCount(photos.length); setStatus("Gotowe");
      setHaStatus(homeAssistant);
      setHaForm({ baseUrl: homeAssistant.baseUrl, token: "", dashboardUrl: homeAssistant.dashboardUrl, overlayEntities: homeAssistant.overlayEntities });
      setHaMessage(homeAssistant.configured ? (homeAssistant.connected ? "Połączono" : homeAssistant.lastError ?? "Łączenie…") : "Nie skonfigurowano");
    }).catch((error) => setStatus(String(error)));
  }, []);

  useEffect(() => {
    if (!haStatus?.configured) return;
    if (haSearch.trim().length < 2) { setHaEntities([]); return; }
    const load = () => api.homeAssistant.entities(haSearch).then(setHaEntities).catch(() => undefined);
    load();
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, [haStatus?.configured, haSearch]);

  useEffect(() => { if (haStatus?.configured) api.homeAssistant.overlay().then(setHaLiveStates).catch(() => undefined); }, [haStatus?.configured]);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; viewId?: ViewId; status?: HomeAssistantStatus; homeAssistant?: HomeAssistantStatus; entities?: HomeAssistantSelectedState[]; homeAssistantStates?: HomeAssistantSelectedState[] };
      if ((message.type === "snapshot" || message.type === "view.activated") && message.viewId) setViews(current => ({ ...current, current: message.viewId! }));
      const next = message.type === "snapshot" ? message.homeAssistant : message.status;
      if (next) {
        setHaStatus(next);
        setHaMessage(next.connected ? "Połączono" : next.lastError ?? (next.configured ? "Łączenie…" : "Nie skonfigurowano"));
      }
      if (message.type === "snapshot" && message.homeAssistantStates) setHaLiveStates(message.homeAssistantStates);
      if (message.type === "ha.stateChanged" && message.entities) setHaLiveStates(message.entities);
    };
    return () => socket.close();
  }, []);

  function updateOverlay(patch: Partial<WallDeckSettings["overlay"]>) {
    setSettings((current) => ({ ...current, overlay: { ...current.overlay, ...patch } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Zapisywanie…");
    try { setSettings(await api.saveSettings(settings)); setStatus("Zapisano i wysłano do panelu"); }
    catch (error) { setStatus(`Błąd: ${String(error)}`); }
  }

  async function activate(viewId: ViewId) {
    const result = await api.activateView(viewId);
    setViews((current) => ({ ...current, current: result.current }));
    setStatus(`Aktywowano widok: ${viewId}`);
  }

  async function testHomeAssistant() {
    setHaMessage("Sprawdzanie połączenia…");
    try {
      const result = await api.homeAssistant.test(haForm.baseUrl, haForm.token);
      setHaMessage(`Połączenie działa · HA ${result.version ?? "?"} · ${result.entityCount} encji`);
    } catch (error) { setHaMessage(`Błąd: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async function saveHomeAssistant(event: FormEvent) {
    event.preventDefault();
    setHaMessage("Sprawdzanie i zapisywanie…");
    try {
      const next = await api.homeAssistant.save({
        baseUrl: haForm.baseUrl,
        token: haForm.token || undefined,
        dashboardUrl: haForm.dashboardUrl,
        overlayEntities: haForm.overlayEntities,
      });
      setSettings(await api.saveSettings(settings));
      setHaStatus(next);
      setHaForm((current) => ({ ...current, token: "" }));
      setHaMessage("Zapisano bezpiecznie. Trwa pobieranie stanu encji…");
    } catch (error) { setHaMessage(`Błąd: ${error instanceof Error ? error.message : String(error)}`); }
  }

  function addOverlayEntity() {
    if (!entityDraft.entityId || haForm.overlayEntities.some((item) => item.entityId === entityDraft.entityId)) return;
    const selected = haEntities.find((item) => item.entityId === entityDraft.entityId);
    setHaForm((current) => ({
      ...current,
      overlayEntities: [...current.overlayEntities, {
        id: crypto.randomUUID(),
        entityId: entityDraft.entityId,
        label: entityDraft.label.trim() || selected?.friendlyName || entityDraft.entityId,
        position: entityDraft.position,
      }],
    }));
    setEntityDraft({ entityId: "", label: "", position: entityDraft.position });
  }

  function updateOverlayEntity(id: string, patch: Partial<HomeAssistantOverlayItem>) {
    setHaForm((current) => ({ ...current, overlayEntities: current.overlayEntities.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><i>W</i><div><strong>WallDeck</strong><small>Panel administratora</small></div></div>
        <nav aria-label="Sekcje konfiguracji">
          {([
            ["overview", "⌂", "Pulpit"],
            ["views", "⌘", "Widoki i reguły"],
            ["photos", "▧", "Album zdjęć"],
            ["ha", "◉", "Home Assistant"],
          ] as const).map(([id, icon, label]) => (
            <button className={section === id ? "is-active" : ""} key={id} onClick={() => setSection(id)}><span>{icon}</span>{label}</button>
          ))}
        </nav>
        <div className="admin-sidebar__status"><i className={haStatus?.connected ? "is-online" : ""} /><span><strong>{haStatus?.connected ? "System online" : "Połączenie częściowe"}</strong><small>{photoCount} zdjęć · {views.current === "photos" ? "Album" : "Home Assistant"}</small></span></div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div><span className="admin-eyebrow">WALLDECK / ADMIN</span><h1>{section === "overview" ? "Pulpit" : section === "views" ? "Widoki i reguły" : section === "photos" ? "Album zdjęć" : "Home Assistant"}</h1></div>
          <span className="admin-save-state">{status}</span>
        </header>

        {section === "overview" && <section className="admin-dashboard">
          <div className="summary-grid">
            <button onClick={() => setSection("views")}><small>Aktywny ekran</small><strong>{views.current === "photos" ? "Album zdjęć" : "Home Assistant"}</strong><span>Zmień lub ustaw reguły →</span></button>
            <button onClick={() => setSection("photos")}><small>Biblioteka</small><strong>{photoCount} zdjęć</strong><span>Ustaw wygląd albumu →</span></button>
            <button onClick={() => setSection("ha")}><small>Home Assistant</small><strong>{haStatus?.connected ? "Połączono" : "Rozłączono"}</strong><span>{haStatus?.entityCount ?? 0} dostępnych encji →</span></button>
          </div>
          <article className="admin-card activity-card">
            <div><span className="admin-kicker">Szybki podgląd</span><h2>Przepływ panelu</h2></div>
            <div className="flow-preview"><span>Album zdjęć</span><b>pojedyncze dotknięcie</b><span>Home Assistant</span><b>{settings.viewRouter.inactivityAction.seconds} s bezczynności</b><span>Album zdjęć</span></div>
          </article>
        </section>}

        {section === "views" && <>
      <section className="admin-card">
        <div><span className="admin-kicker">Widoki</span><h2>Aktywny ekran</h2></div>
        <div className="view-list">
          {views.available.map((view, index) => (
            <button className={views.current === view.id ? "is-active" : ""} key={view.id} onClick={() => activate(view.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span><strong>{view.name}</strong><small>{views.current === view.id ? "Aktywny" : "Wywołaj"}</small>
            </button>
          ))}
        </div>
      </section>

      <form className="admin-card admin-form" onSubmit={save}>
        <div><span className="admin-kicker">Manager widoków</span><h2>Reguły przełączania</h2></div>
        <p className="form-intro">Reguły reagują na zdarzenia panelu. Dotknięcia wewnątrz dashboardu HA są wykrywane przez aplikację tabletową.</p>
        <div className="rule-list">
          <article>
            <label className="switch-row"><input type="checkbox" checked={settings.viewRouter.tapAction.enabled} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, tapAction: { ...settings.viewRouter.tapAction, enabled: e.target.checked } } })} /><span><strong>Pojedyncze dotknięcie</strong><small>Gdy użytkownik dotknie wskazanego widoku</small></span></label>
            <div className="rule-flow"><select value={settings.viewRouter.tapAction.sourceView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, tapAction: { ...settings.viewRouter.tapAction, sourceView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select><span>→</span><select value={settings.viewRouter.tapAction.targetView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, tapAction: { ...settings.viewRouter.tapAction, targetView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select></div>
          </article>
          <article>
            <label className="switch-row"><input type="checkbox" checked={settings.viewRouter.inactivityAction.enabled} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, enabled: e.target.checked } } })} /><span><strong>Powrót po bezczynności</strong><small>Resetowany przy każdym dotknięciu panelu</small></span></label>
            <div className="rule-flow"><label><input type="number" min="5" max="3600" value={settings.viewRouter.inactivityAction.seconds} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, seconds: Number(e.target.value) } } })} /><small>sekund</small></label><span>→</span><select value={settings.viewRouter.inactivityAction.targetView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, targetView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select></div>
          </article>
          <article>
            <label className="switch-row"><input type="checkbox" checked={settings.viewRouter.swipeDownAction.enabled} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, swipeDownAction: { ...settings.viewRouter.swipeDownAction, enabled: e.target.checked } } })} /><span><strong>Przesunięcie w dół</strong><small>Własny gest WallDeck rozpoczynany w górnych 40% ekranu</small></span></label>
            <div className="rule-flow"><select value={settings.viewRouter.swipeDownAction.sourceView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, swipeDownAction: { ...settings.viewRouter.swipeDownAction, sourceView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select><span>→</span><select value={settings.viewRouter.swipeDownAction.targetView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, swipeDownAction: { ...settings.viewRouter.swipeDownAction, targetView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select></div>
          </article>
        </div>
        <footer><span>{status}</span><button type="submit">Zapisz reguły</button></footer>
      </form>
      </>}

      {section === "ha" &&
      <form className="admin-card admin-form ha-admin" onSubmit={saveHomeAssistant}>
        <div className="ha-heading">
          <div><span className="admin-kicker">Integracja</span><h2>Home Assistant</h2></div>
          <span className={`connection-badge ${haStatus?.connected ? "is-connected" : ""}`}><i />{haStatus?.connected ? "Połączono" : "Rozłączono"}</span>
        </div>
        <p className="form-intro">WallDeck łączy się z Home Assistant na serwerze. Token jest szyfrowany i po zapisaniu nie wraca do przeglądarki.</p>
        <div className="field-grid ha-fields">
          <label>Adres Home Assistant<input required type="url" placeholder="http://homeassistant.local:8123" value={haForm.baseUrl} onChange={(e) => setHaForm({ ...haForm, baseUrl: e.target.value })} /></label>
          <label>Long-Lived Access Token<input type="password" autoComplete="new-password" placeholder={haStatus?.configured ? "Zapisany — pozostaw puste" : "Wklej token"} value={haForm.token} onChange={(e) => setHaForm({ ...haForm, token: e.target.value })} /></label>
          <label>Adres dashboardu<input type="url" placeholder="http://homeassistant.local:8123/lovelace/0" value={haForm.dashboardUrl} onChange={(e) => setHaForm({ ...haForm, dashboardUrl: e.target.value })} /></label>
        </div>
        <div className="ha-metrics">
          <span><small>Wersja</small><strong>{haStatus?.version ?? "—"}</strong></span>
          <span><small>Encje</small><strong>{haStatus?.entityCount ?? 0}</strong></span>
          <span><small>Token</small><strong>{haStatus?.configured ? "zapisany" : "brak"}</strong></span>
        </div>
        <label className="brightness-control">
          <span><strong>Jasność tabletu dla widoku Home Assistant</strong><output>{Math.round(settings.viewBrightness.ha * 100)}%</output></span>
          <input type="range" min="5" max="100" step="1" value={Math.round(settings.viewBrightness.ha * 100)} onChange={(event) => setSettings({ ...settings, viewBrightness: { ...settings.viewBrightness, ha: Number(event.target.value) / 100 } })} />
          <small>Zostanie zastosowana po aktywowaniu widoku Home Assistant.</small>
        </label>
        <div className="entity-picker">
          <div><strong>Elementy Home Assistant na zdjęciach</strong><small>Dodaj dowolne encje i przypisz każdej etykietę oraz miejsce na ekranie.</small></div>
          <div className="entity-add-grid">
            <label>Szukaj encji<input placeholder="wpisz co najmniej 2 znaki" value={haSearch} onChange={(e) => setHaSearch(e.target.value)} /></label>
            <label>Encja<select value={entityDraft.entityId} onChange={(e) => setEntityDraft({ ...entityDraft, entityId: e.target.value })}>
              <option value="">Wybierz encję…</option>
              {haEntities.map((entity) => <option key={entity.entityId} value={entity.entityId}>{entity.friendlyName} · {entity.state} {entity.unit ?? ""} ({entity.entityId})</option>)}
            </select></label>
            <label>Etykieta<input placeholder="Automatycznie z HA" value={entityDraft.label} onChange={(e) => setEntityDraft({ ...entityDraft, label: e.target.value })} /></label>
            <label>Pozycja<select value={entityDraft.position} onChange={(e) => setEntityDraft({ ...entityDraft, position: e.target.value as HomeAssistantOverlayItem["position"] })}>{positions.map((position) => <option key={position.value} value={position.value}>{position.label}</option>)}</select></label>
            <button type="button" className="entity-add-button" disabled={!entityDraft.entityId} onClick={addOverlayEntity}>Dodaj na ekran</button>
          </div>
          <div className="entity-overlay-list">
            {haForm.overlayEntities.length === 0 && <p>Nie dodano jeszcze żadnej encji.</p>}
            {haForm.overlayEntities.map((item) => {
              const live = haLiveStates.find((entity) => entity.id === item.id);
              const catalog = haEntities.find((entity) => entity.entityId === item.entityId);
              return <article key={item.id}>
                <div><strong>{live?.friendlyName ?? catalog?.friendlyName ?? item.entityId}</strong><small>{item.entityId} · {live ? `${live.state} ${live.unit ?? ""}` : catalog ? `${catalog.state} ${catalog.unit ?? ""}` : "oczekuje na stan"}</small></div>
                <input aria-label={`Etykieta ${item.entityId}`} value={item.label} onChange={(e) => updateOverlayEntity(item.id, { label: e.target.value })} />
                <select aria-label={`Pozycja ${item.entityId}`} value={item.position} onChange={(e) => updateOverlayEntity(item.id, { position: e.target.value as HomeAssistantOverlayItem["position"] })}>{positions.map((position) => <option key={position.value} value={position.value}>{position.label}</option>)}</select>
                <button type="button" onClick={() => setHaForm((current) => ({ ...current, overlayEntities: current.overlayEntities.filter((candidate) => candidate.id !== item.id) }))}>Usuń</button>
              </article>;
            })}
          </div>
        </div>
        <footer><span>{haMessage}</span><div className="button-row"><button className="button-secondary" type="button" onClick={testHomeAssistant}>Testuj połączenie</button><button type="submit">Zapisz integrację</button></div></footer>
      </form>}

      {section === "photos" &&
      <form className="admin-card admin-form" onSubmit={save}>
        <div><span className="admin-kicker">Widok 01</span><h2>Album zdjęć</h2></div>
        <label className="brightness-control">
          <span><strong>Jasność tabletu dla tego widoku</strong><output>{Math.round(settings.viewBrightness.photos * 100)}%</output></span>
          <input
            type="range"
            min="5"
            max="100"
            step="1"
            value={Math.round(settings.viewBrightness.photos * 100)}
            onChange={(event) => setSettings({ ...settings, viewBrightness: { ...settings.viewBrightness, photos: Number(event.target.value) / 100 } })}
          />
          <small>Po zapisaniu jasność zmieni się automatycznie, gdy widok Album zdjęć jest aktywny.</small>
        </label>
        <div className="field-grid">
          <label>Zmiana zdjęć <span><input type="number" min="10" max="3600" value={settings.photoIntervalSeconds} onChange={(e) => setSettings({ ...settings, photoIntervalSeconds: Number(e.target.value) })} /> sekund</span></label>
          <label>Czas przejścia <span><input type="number" min="0.3" max="5" step="0.1" value={settings.transitionSeconds} onChange={(e) => setSettings({ ...settings, transitionSeconds: Number(e.target.value) })} /> sekund</span></label>
          <label>Pozycja overlayu <select value={settings.overlay.position} onChange={(e) => updateOverlay({ position: e.target.value as WallDeckSettings["overlay"]["position"] })}>{positions.map((position) => <option key={position.value} value={position.value}>{position.label}</option>)}</select></label>
        </div>
        <div className="toggle-grid">
          {["showClock", "showDate", "showWeather", "showHomeAssistantPlaceholder"].map((key) => {
            const typedKey = key as keyof Pick<WallDeckSettings["overlay"], "showClock" | "showDate" | "showWeather" | "showHomeAssistantPlaceholder">;
            const labels = { showClock: "Godzina", showDate: "Data", showWeather: "Pogoda", showHomeAssistantPlaceholder: "Status domu (placeholder HA)" };
            return <label key={key}><input type="checkbox" checked={settings.overlay[typedKey]} onChange={(e) => updateOverlay({ [typedKey]: e.target.checked })} /><span>{labels[typedKey]}</span></label>;
          })}
        </div>
        <div className="field-grid">
          <label>Nazwa lokalizacji <input value={settings.overlay.weatherLocation.label} onChange={(e) => updateOverlay({ weatherLocation: { ...settings.overlay.weatherLocation, label: e.target.value } })} /></label>
          <label>Szerokość geograficzna <input type="number" step="0.0001" value={settings.overlay.weatherLocation.latitude ?? ""} onChange={(e) => updateOverlay({ weatherLocation: { ...settings.overlay.weatherLocation, latitude: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
          <label>Długość geograficzna <input type="number" step="0.0001" value={settings.overlay.weatherLocation.longitude ?? ""} onChange={(e) => updateOverlay({ weatherLocation: { ...settings.overlay.weatherLocation, longitude: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
        </div>
        <footer><span>{status}</span><button type="submit">Zapisz ustawienia</button></footer>
      </form>}
      </div>
    </main>
  );
}
