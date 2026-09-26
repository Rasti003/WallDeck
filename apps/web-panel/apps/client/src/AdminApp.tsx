import { useEffect, useState, type FormEvent } from "react";
import { defaultSettings, type ViewId, type WallDeckSettings } from "@walldeck/contracts";
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

  useEffect(() => {
    Promise.all([api.settings(), api.views(), api.photos()]).then(([nextSettings, nextViews, photos]) => {
      setSettings(nextSettings); setViews(nextViews); setPhotoCount(photos.length); setStatus("Gotowe");
    }).catch((error) => setStatus(String(error)));
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
          {views.available.map((view) => (
            <button className={views.current === view.id ? "is-active" : ""} key={view.id} onClick={() => activate(view.id)}>
              <span>01</span><strong>{view.name}</strong><small>{views.current === view.id ? "Aktywny" : "Wywołaj"}</small>
            </button>
          ))}
        </div>
      </section>

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
