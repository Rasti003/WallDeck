import { useEffect, useState, type FormEvent } from "react";
import {
  defaultSettings,
  type DeviceStatus,
  type HomeAssistantEntity,
  type HomeAssistantOverlayItem,
  type HomeAssistantSelectedState,
  type HomeAssistantStatus,
  type ViewId,
  type WallDeckSettings,
} from "@walldeck/contracts";
import { api } from "./api";
import { PhotoAdmin } from "./photos/PhotoAdmin";
import { NotificationAdmin } from "./NotificationAdmin";
import { connectEvents } from "./events";
import { menuLabels } from "./TabletMenu";
import { StateMachinesAdmin } from "./StateMachinesAdmin";
import { AssistantAdmin } from "./assistant/AssistantAdmin";
import { createOverlayItemId } from "./overlay-item-id";
import { McpAdmin } from "./McpAdmin";
import { MusicAdmin } from "./MusicAdmin";
import { AiAssistantAdmin } from "./AiAssistantAdmin";

const positions: { value: WallDeckSettings["overlay"]["position"]; label: string }[] = [
  { value: "top-left", label: "Góra — lewo" }, { value: "top-center", label: "Góra — środek" },
  { value: "top-right", label: "Góra — prawo" }, { value: "bottom-left", label: "Dół — lewo" },
  { value: "bottom-center", label: "Dół — środek" }, { value: "bottom-right", label: "Dół — prawo" },
];

const reportingModes: Record<number, string> = { 0: "ciągły", 1: "przy zmianie", 2: "jednorazowy", 3: "specjalny" };
const permissionLabels: Record<keyof DeviceStatus["permissions"], string> = {
  overlay: "Wyświetlanie nad aplikacjami", notifications: "Powiadomienia", microphone: "Mikrofon",
  camera: "Kamera", activityRecognition: "Rozpoznawanie aktywności",
};

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
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [section, setSection] = useState<"overview" | "views" | "photos" | "notifications" | "ha" | "assistant" | "mcp" | "device" | "music" | "states">("overview");
  useEffect(() => { const open = () => setSection("photos"); window.addEventListener("walldeck:openAdminPhotos", open); return () => window.removeEventListener("walldeck:openAdminPhotos", open); }, []);

  useEffect(() => {
    Promise.all([api.settings(), api.views(), api.photos(), api.homeAssistant.config(), api.devices()]).then(([nextSettings, nextViews, photos, homeAssistant, nextDevices]) => {
      setSettings(nextSettings); setViews(nextViews); setPhotoCount(photos.length); setStatus("Gotowe");
      setDevices(nextDevices);
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
    const timer = setInterval(() => api.devices().then(setDevices).catch(() => undefined), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socket = connectEvents((event) => {
      const message = JSON.parse(event.data) as { type: string; viewId?: ViewId; status?: HomeAssistantStatus; homeAssistant?: HomeAssistantStatus; entities?: HomeAssistantSelectedState[]; homeAssistantStates?: HomeAssistantSelectedState[]; devices?: DeviceStatus[]; device?: DeviceStatus };
      if ((message.type === "snapshot" || message.type === "view.activated") && message.viewId) setViews(current => ({ ...current, current: message.viewId! }));
      const next = message.type === "snapshot" ? message.homeAssistant : message.type === "ha.statusChanged" ? message.status : undefined;
      if (message.type === "photos.changed") void api.photos().then(items => setPhotoCount(items.length));
      if (next) {
        setHaStatus(next);
        setHaMessage(next.connected ? "Połączono" : next.lastError ?? (next.configured ? "Łączenie…" : "Nie skonfigurowano"));
      }
      if (message.type === "snapshot" && message.homeAssistantStates) setHaLiveStates(message.homeAssistantStates);
      if (message.type === "ha.stateChanged" && message.entities) setHaLiveStates(message.entities);
      if (message.type === "snapshot" && message.devices) setDevices(message.devices);
      if (message.type === "device.updated" && message.device) setDevices((current) => [...current.filter((device) => device.deviceId !== message.device!.deviceId), message.device!]);
    });
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
    try {
      const result = await api.activateView(viewId);
      setViews((current) => ({ ...current, current: result.current }));
      setStatus(`Aktywowano widok: ${viewId}`);
    } catch (error) { setStatus(`Nie udało się przełączyć widoku: ${String(error)}`); }
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
        id: createOverlayItemId(),
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

  const device = devices.find((candidate) => candidate.online) ?? devices[0];
  const lightSensor = device?.sensors.find((sensor) => sensor.type === 5);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><i>W</i><div><strong>WallDeck</strong><small>Panel administratora</small></div></div>
        <nav aria-label="Sekcje konfiguracji">
          {([
            ["overview", "⌂", "Pulpit"],
            ["views", "⌘", "Widoki i reguły"],
            ["states", "⇄", "Stany i przejścia"],
            ["photos", "▧", "Album zdjęć"],
            ["notifications", "◈", "Powiadomienia"],
            ["music", "♫", "Music · Spotify"],
            ["ha", "◉", "Home Assistant"],
            ["assistant", "◌", "Twarz asystenta"],
            ["mcp", "✦", "Asystent AI i MCP"],
            ["device", "▣", "Urządzenie"],
          ] as const).map(([id, icon, label]) => (
            <button className={section === id ? "is-active" : ""} key={id} onClick={() => setSection(id)}><span>{icon}</span>{label}</button>
          ))}
        </nav>
        <div className="admin-sidebar__status"><i className={haStatus?.connected ? "is-online" : ""} /><span><strong>{haStatus?.connected ? "System online" : "Połączenie częściowe"}</strong><small>{photoCount} zdjęć · {views.available.find((view) => view.id === views.current)?.name ?? views.current}</small></span></div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div><span className="admin-eyebrow">WALLDECK / ADMIN</span><h1>{section === "states" ? "Stany i przejścia" : section === "overview" ? "Pulpit" : section === "views" ? "Widoki i reguły" : section === "photos" ? "Album zdjęć" : section === "notifications" ? "Powiadomienia" : section === "assistant" ? "Twarz asystenta" : section === "mcp" ? "Asystent AI i MCP" : section === "device" ? "Urządzenie" : section === "music" ? "Music · Spotify" : "Home Assistant"}</h1></div>
          <span className="admin-save-state">{status}</span>
        </header>

        {section === "states" && <StateMachinesAdmin settings={settings} currentView={views.current} />}

        {section === "notifications" && <NotificationAdmin settings={settings} setSettings={setSettings} save={save} status={status} />}

        {section === "music" && <MusicAdmin settings={settings} setSettings={setSettings} save={save} activate={() => activate("music")} status={status} />}

        {section === "overview" && <section className="admin-dashboard">
          <div className="summary-grid">
            <button onClick={() => setSection("views")}><small>Aktywny ekran</small><strong>{views.available.find((view) => view.id === views.current)?.name ?? views.current}</strong><span>Zmień lub ustaw reguły →</span></button>
            <button onClick={() => setSection("photos")}><small>Biblioteka</small><strong>{photoCount} zdjęć</strong><span>Ustaw wygląd albumu →</span></button>
            <button onClick={() => setSection("ha")}><small>Home Assistant</small><strong>{haStatus?.connected ? "Połączono" : "Rozłączono"}</strong><span>{haStatus?.entityCount ?? 0} dostępnych encji →</span></button>
            <button onClick={() => setSection("device")}><small>Tablet</small><strong>{devices[0]?.online ? "Online" : "Brak danych"}</strong><span>{devices[0]?.sensors.length ?? 0} sensorów →</span></button>
          </div>
          <article className="admin-card activity-card">
            <div><span className="admin-kicker">Szybki podgląd</span><h2>Przepływ panelu</h2></div>
            <div className="flow-preview"><span>Album zdjęć</span><b>pojedyncze dotknięcie</b><span>Home Assistant</span><b>{settings.viewRouter.inactivityAction.seconds} s bezczynności</b>{settings.viewRouter.inactivityAction.showAssistantIdleBeforePhotos && <><span>Asystent idle</span><b>{settings.viewRouter.inactivityAction.assistantIdleSeconds} s</b></>}<span>Album zdjęć</span></div>
          </article>
        </section>}

        {section === "assistant" && <AssistantAdmin settings={settings} setSettings={setSettings} save={save} status={status} />}

        {section === "mcp" && <section className="ai-mcp-admin"><AiAssistantAdmin settings={settings} setSettings={setSettings} /><McpAdmin settings={settings} setSettings={setSettings} save={save} status={status} /></section>}

        {section === "device" && <section className="device-admin">
          {!device && <article className="admin-card device-empty">
            <span className="admin-kicker">Diagnostyka</span><h2>Oczekiwanie na tablet</h2>
            <p>Otwórz WallDeck na tablecie. Dane urządzenia pojawią się tutaj automatycznie po połączeniu aplikacji z panelem.</p>
          </article>}
          {device && <>
            <article className="admin-card device-overview">
              <div className="device-heading">
                <div><span className="admin-kicker">{device.deviceId}</span><h2>{device.manufacturer} {device.model}</h2></div>
                <span className={`connection-badge ${device.online ? "is-connected" : ""}`}><i />{device.online ? "Online" : "Offline"}</span>
              </div>
              <div className="device-metrics">
                <span><small>Android</small><strong>{device.android}</strong><em>API {device.sdk}</em></span>
                <span><small>Ekran aplikacji</small><strong>{device.screen.width} × {device.screen.height}</strong><em>{device.screen.densityDpi} dpi</em></span>
                <span><small>Bateria</small><strong>{device.battery.percent >= 0 ? `${device.battery.percent}%` : "—"}</strong><em>{device.battery.powerConnected ? (device.battery.charging ? "ładowanie" : "zasilanie podłączone") : "zasilanie odłączone"}</em></span>
                <span><small>WallDeck</small><strong>{device.appVersion.name}</strong><em>build {device.appVersion.code}</em></span>
                <span className={`light-reading ${lightSensor && lightSensor.value == null ? "is-unavailable" : ""}`}><small>Sensor światła</small><strong>{!lightSensor ? "brak" : lightSensor.value == null ? "brak odczytu" : `${Math.round(lightSensor.value)} lx`}</strong><em>{!lightSensor ? "niewykryty" : lightSensor.value == null ? "wykryty · HyperOS blokuje pomiar" : lightSensor.name}</em></span>
                <span><small>Ostatni raport</small><strong>{new Date(device.lastSeen).toLocaleTimeString("pl-PL")}</strong><em>{new Date(device.lastSeen).toLocaleDateString("pl-PL")}</em></span>
              </div>
            </article>

            <article className="admin-card">
              <div><span className="admin-kicker">Uprawnienia aplikacji</span><h2>Status dostępu</h2></div>
              <div className="permission-grid">
                {(Object.entries(device.permissions) as [keyof DeviceStatus["permissions"], boolean][]).map(([key, granted]) =>
                  <span className={granted ? "is-granted" : ""} key={key}><i /> <strong>{permissionLabels[key]}</strong><small>{granted ? "przyznane" : "nieprzyznane"}</small></span>
                )}
              </div>
            </article>

            <article className="admin-card sensor-catalog">
              <div className="sensor-catalog__heading"><div><span className="admin-kicker">Sprzęt Android</span><h2>Dostępne sensory</h2></div><strong>{device.sensors.length}</strong></div>
              <p className="form-intro">Lista pochodzi bezpośrednio z Android SensorManager. Warianty wake-up są pokazane osobno, ponieważ system udostępnia je jako osobne sensory.</p>
              <div className="sensor-grid">
                {device.sensors.map((sensor, index) => <article key={`${sensor.type}-${sensor.name}-${sensor.wakeUp}-${index}`}>
                  <header><span>{sensor.type === 5 ? "Światło" : `Typ ${sensor.type}`}</span>{sensor.wakeUp && <b>wake-up</b>}</header>
                  <h3>{sensor.name}</h3>
                  <code>{sensor.stringType}</code>
                  <dl>
                    <div><dt>Producent</dt><dd>{sensor.vendor}</dd></div>
                    <div><dt>Tryb</dt><dd>{reportingModes[sensor.reportingMode] ?? `kod ${sensor.reportingMode}`}</dd></div>
                    <div><dt>Pobór</dt><dd>{sensor.power.toFixed(3)} mA</dd></div>
                    <div><dt>Zakres</dt><dd>{sensor.maximumRange}</dd></div>
                    <div><dt>Rozdzielczość</dt><dd>{sensor.resolution}</dd></div>
                    {sensor.value != null && <div><dt>Odczyt</dt><dd>{sensor.value.toFixed(1)} {sensor.unit ?? ""}</dd></div>}
                  </dl>
                  {sensor.requiredPermission && <small>Wymaga: {sensor.requiredPermission}</small>}
                </article>)}
              </div>
            </article>
          </>}
        </section>}

        {section === "views" && <>
      <form className="admin-card admin-form" onSubmit={save}><h2>Menu tabletu</h2><p>Pasek widoków otwierany gestem w dół lub uchwytem u góry ekranu. Zastępuje regułę gestu w dół, gdy jest włączony.</p>
      <label><input type="checkbox" checked={settings.tabletMenu.enabled} onChange={e=>setSettings({...settings,tabletMenu:{...settings.tabletMenu,enabled:e.target.checked}})} /> Włącz menu na wszystkich widokach</label>
      {([...settings.tabletMenu.views,...(Object.keys(menuLabels) as ViewId[]).filter(v=>!settings.tabletMenu.views.includes(v))]).map(v=><div key={v} className="rule-flow"><label><input type="checkbox" checked={settings.tabletMenu.views.includes(v)} disabled={settings.tabletMenu.views.length===1&&settings.tabletMenu.views.includes(v)} onChange={e=>setSettings({...settings,tabletMenu:{...settings.tabletMenu,views:e.target.checked?[...settings.tabletMenu.views,v]:settings.tabletMenu.views.filter(x=>x!==v)}})} />{menuLabels[v]}</label><button type="button" disabled={settings.tabletMenu.views.indexOf(v)<=0} onClick={()=>{const next=[...settings.tabletMenu.views];const i=next.indexOf(v);[next[i-1],next[i]]=[next[i],next[i-1]];setSettings({...settings,tabletMenu:{...settings.tabletMenu,views:next}})}} aria-label={`Przesuń ${menuLabels[v]} wyżej`}>↑</button></div>)}
      <button type="submit">Zapisz menu</button></form>

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
            <div className="rule-flow"><select aria-label="Widok bezczynności" value={settings.viewRouter.inactivityAction.sourceView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, sourceView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select><label><input aria-label="Czas bezczynności" type="number" min="5" max="3600" value={settings.viewRouter.inactivityAction.seconds} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, seconds: Number(e.target.value) } } })} /><small>sekund</small></label><span>→</span><select aria-label="Widok docelowy bezczynności" value={settings.viewRouter.inactivityAction.targetView} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, targetView: e.target.value as ViewId } } })}>{views.available.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select></div>
            <label className="switch-row"><input type="checkbox" checked={settings.viewRouter.inactivityAction.showAssistantIdleBeforePhotos} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, showAssistantIdleBeforePhotos: e.target.checked } } })} /><span><strong>Pokaż asystenta przed galerią</strong><small>Spokojna mimika idle; dotknięcie wraca do widoku źródłowego</small></span></label>
            <div className="rule-flow"><span>Asystent idle / taniec</span><label><input aria-label="Czas asystenta idle lub tańca" type="number" min="3" max="300" value={settings.viewRouter.inactivityAction.assistantIdleSeconds} onChange={(e) => setSettings({ ...settings, viewRouter: { ...settings.viewRouter, inactivityAction: { ...settings.viewRouter.inactivityAction, assistantIdleSeconds: Number(e.target.value) } } })} /><small>sekund</small></label><span>→</span><span>Album / Music</span></div><p>Po wejściu z Music do HA: gdy muzyka nadal gra, po bezczynności pojawi się taniec i powrót do Music. Dotyk podczas tańca otwiera Music natychmiast. Bez odtwarzania obowiązuje zwykła reguła powrotu.</p>
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
      <PhotoAdmin />}
      {section === "photos" &&
      <form className="admin-card admin-form" onSubmit={save}>
        <div><span className="admin-kicker">Widok 01</span><h2>Album zdjęć</h2></div>
        <div className="field-grid"><label>Przytrzymanie (ms)<input type="number" min="500" max="1500" step="100" value={settings.gallery.holdMilliseconds} onChange={e => setSettings({ ...settings, gallery: { ...settings.gallery, holdMilliseconds: Number(e.target.value) } })} /></label><label><input type="checkbox" checked={settings.gallery.notifyNewPhotos} onChange={e => setSettings({ ...settings, gallery: { ...settings.gallery, notifyNewPhotos: e.target.checked } })} /> Powiadomienia o nowych zdjęciach</label></div>
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
