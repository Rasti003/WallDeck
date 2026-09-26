import { useEffect, useState, type FormEvent } from "react";
import {
  defaultSettings,
  type HomeAssistantEntity,
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
  const [haForm, setHaForm] = useState({ baseUrl: "", token: "", dashboardUrl: "", co2EntityId: "" });
  const [haEntities, setHaEntities] = useState<HomeAssistantEntity[]>([]);
  const [haSearch, setHaSearch] = useState("co2");
  const [haMessage, setHaMessage] = useState("Nie skonfigurowano");

  useEffect(() => {
    Promise.all([api.settings(), api.views(), api.photos(), api.homeAssistant.config()]).then(([nextSettings, nextViews, photos, homeAssistant]) => {
      setSettings(nextSettings); setViews(nextViews); setPhotoCount(photos.length); setStatus("Gotowe");
      setHaStatus(homeAssistant);
      setHaForm({ baseUrl: homeAssistant.baseUrl, token: "", dashboardUrl: homeAssistant.dashboardUrl, co2EntityId: homeAssistant.co2EntityId ?? "" });
      setHaMessage(homeAssistant.configured ? (homeAssistant.connected ? "Połączono" : homeAssistant.lastError ?? "Łączenie…") : "Nie skonfigurowano");
    }).catch((error) => setStatus(String(error)));
  }, []);

  useEffect(() => {
    if (!haStatus?.configured) return;
    const load = () => api.homeAssistant.entities(haSearch).then(setHaEntities).catch(() => undefined);
    load();
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, [haStatus?.configured, haSearch]);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; status?: HomeAssistantStatus; homeAssistant?: HomeAssistantStatus };
      const next = message.type === "snapshot" ? message.homeAssistant : message.status;
      if (next) {
        setHaStatus(next);
        setHaMessage(next.connected ? "Połączono" : next.lastError ?? (next.configured ? "Łączenie…" : "Nie skonfigurowano"));
      }
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
        co2EntityId: haForm.co2EntityId || null,
      });
      setSettings(await api.saveSettings(settings));
      setHaStatus(next);
      setHaForm((current) => ({ ...current, token: "" }));
      setHaMessage("Zapisano bezpiecznie. Trwa pobieranie stanu encji…");
    } catch (error) { setHaMessage(`Błąd: ${error instanceof Error ? error.message : String(error)}`); }
  }

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <span className="admin-eyebrow">WALLDECK / ADMIN</span>
        <h1>Sterowanie panelem</h1>
        <p>Konfiguracja jest dostępna tylko pod adresem <code>/admin</code>. WallPanel nie pokazuje odnośnika do tego ekranu.</p>
        <div className="admin-stats"><span><b>{photoCount}</b> zdjęć</span><span><b>{views.current}</b> aktywny widok</span></div>
      </header>

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
          <div><strong>Czujnik CO₂ w overlayu</strong><small>Wyszukaj encję, a potem wybierz ją z listy.</small></div>
          <input placeholder="Szukaj po nazwie lub entity_id" value={haSearch} onChange={(e) => setHaSearch(e.target.value)} />
          <select value={haForm.co2EntityId} onChange={(e) => setHaForm({ ...haForm, co2EntityId: e.target.value })}>
            <option value="">Bez czujnika CO₂</option>
            {haEntities.map((entity) => <option key={entity.entityId} value={entity.entityId}>{entity.friendlyName} · {entity.state} {entity.unit ?? ""} ({entity.entityId})</option>)}
          </select>
        </div>
        <footer><span>{haMessage}</span><div className="button-row"><button className="button-secondary" type="button" onClick={testHomeAssistant}>Testuj połączenie</button><button type="submit">Zapisz integrację</button></div></footer>
      </form>

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
      </form>
    </main>
  );
}
