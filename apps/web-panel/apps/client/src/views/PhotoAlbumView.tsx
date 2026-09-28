import { AnimatePresence, motion } from "motion/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { HomeAssistantSelectedState, PhotoItem, WallDeckSettings, WeatherNow } from "@walldeck/contracts";
import { api } from "../api";
import { connectEvents } from "../events";
import { useLandscape, useNow } from "../hooks";
import { createPhotoLayout, type PhotoLayout } from "./photo-layout";
import { PanelContext } from "../panel-context";
import { usePhotos } from "../photos/usePhotos";
import { CroppedPhoto } from "../photos/CroppedPhoto";
import { PhotoLibrary, PhotoSyncControls } from "../photos/PhotoLibrary";
import { advanceHistory, type PhotoHistory } from "../photos/history";

function weatherSymbol(code: number, isDay: boolean) {
  if (code === 0) return isDay ? "☀" : "☾";
  if (code <= 3) return "☁";
  if (code === 45 || code === 48) return "≋";
  if (code >= 71 && code <= 86) return "❄";
  if (code >= 95) return "ϟ";
  return "☂";
}

const overlayPositions: WallDeckSettings["overlay"]["position"][] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

function Overlay({ settings, weather, homeAssistant }: { settings: WallDeckSettings; weather: WeatherNow | null; homeAssistant: HomeAssistantSelectedState[] }) {
  const now = useNow();
  const { overlay } = settings;
  return (
    <>
      {overlayPositions.map((position) => {
        const isPrimary = position === overlay.position;
        const entities = homeAssistant.filter((item) => item.position === position);
        if (!isPrimary && entities.length === 0) return null;
        return <div key={position} className={`ambient-overlay ambient-overlay--${position}`}>
          {isPrimary && overlay.showClock && <div className="ambient-overlay__time">{now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</div>}
          {isPrimary && overlay.showDate && <div className="ambient-overlay__date">{now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</div>}
          {isPrimary && overlay.showWeather && weather && (
            <div className="ambient-overlay__weather">
              <span>{weatherSymbol(weather.weatherCode, weather.isDay)}</span>
              <span>{Math.round(weather.temperature)}°</span>
              <small>{weather.label}</small>
            </div>
          )}
          {entities.length > 0 && <div className="ambient-overlay__entities">
            {entities.map((entity) => <div className="ambient-overlay__entity" key={entity.id}>
              <small>{entity.label}</small>
              <strong>{entity.state}{entity.unit ? ` ${entity.unit}` : ""}</strong>
            </div>)}
          </div>}
          {isPrimary && entities.length === 0 && overlay.showHomeAssistantPlaceholder && <div className="ambient-overlay__ha"><i /> Dom spokojny</div>}
        </div>
      })}
    </>
  );
}

export function PhotoAlbumView() {
  const landscapeScreen = useLandscape();
  const library = usePhotos();
  const photos = library.photos.filter(p => !p.edit?.hidden);
  const { setInteractionLocked, menuOpen } = useContext(PanelContext);
  const [dialog, setDialog] = useState<"menu" | "library" | null>(null);
  const [settings, setSettings] = useState<WallDeckSettings | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [homeAssistant, setHomeAssistant] = useState<HomeAssistantSelectedState[]>([]);
  const [history, setHistory] = useState<PhotoHistory>({ items: [], index: -1 });
  const layout = history.items[history.index] ?? null;
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const nextLayout = useRef<PhotoLayout | null>(null);
  const touch = useRef<{ x: number; y: number; held: boolean; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelHold = () => { if (touch.current) clearTimeout(touch.current.timer); };
  useEffect(() => () => cancelHold(), []);
  useEffect(() => { setInteractionLocked(Boolean(dialog)); return () => setInteractionLocked(false); }, [dialog, setInteractionLocked]);
  useEffect(() => { const open = () => setDialog("library"); window.addEventListener("walldeck:openPhotoLibrary", open); if (sessionStorage.getItem("openPhotoLibrary")) { sessionStorage.removeItem("openPhotoLibrary"); open(); } return () => window.removeEventListener("walldeck:openPhotoLibrary", open); }, []);

  useEffect(() => {
    api.settings()
      .then((settingsData) => {
        setSettings(settingsData);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  useEffect(() => { api.homeAssistant.overlay().then(setHomeAssistant).catch(() => undefined); }, []);

  const refreshWeather = useCallback(() => {
    api.weather().then(setWeather).catch(() => setWeather(null));
  }, []);

  useEffect(() => {
    if (!settings?.overlay.showWeather) return;
    refreshWeather();
    const timer = setInterval(refreshWeather, 10 * 60_000);
    return () => clearInterval(timer);
  }, [settings?.overlay.showWeather, settings?.overlay.weatherLocation.latitude, settings?.overlay.weatherLocation.longitude, refreshWeather]);

  useEffect(() => {
    setHistory(old => {
      const available = new Map(photos.map(p => [p.id, p]));
      const items = old.items.map(l => ({ ...l, items: l.items.filter(p => available.has(p.id)).map(p => available.get(p.id)!) })).filter(l => l.items.length === (l.kind === "pair" ? 2 : 1));
      if (items.length) return { items, index: Math.min(old.index, items.length - 1) };
      const first = createPhotoLayout(photos, landscapeScreen, null);
      return { items: first ? [first] : [], index: first ? 0 : -1 };
    });
    nextLayout.current = null;
  }, [library.photos]);
  useEffect(() => { const first = createPhotoLayout(photos, landscapeScreen, null); setHistory({ items: first ? [first] : [], index: first ? 0 : -1 }); }, [landscapeScreen]);

  useEffect(() => {
    if (!layout || !photos.length) return;
    const next = createPhotoLayout(photos, landscapeScreen, layout);
    nextLayout.current = next;
    next?.items.forEach((photo) => { const image = new Image(); image.src = photo.url; });
  }, [layout, library.photos, landscapeScreen]);

  const navigate = (direction: -1 | 1) => { setHistory(old => advanceHistory(old, direction, () => nextLayout.current ?? createPhotoLayout(photos, landscapeScreen, old.items[old.index] ?? null))); nextLayout.current = null; setTick(t => t + 1); };

  useEffect(() => {
    if (!settings || !photos.length || dialog || menuOpen) return;
    const timer = setTimeout(() => navigate(1), settings.photoIntervalSeconds * 1_000);
    return () => clearTimeout(timer);
  }, [library.photos, landscapeScreen, settings?.photoIntervalSeconds, dialog, menuOpen, history, tick]);

  useEffect(() => {
    const socket = connectEvents((event) => {
      const message = JSON.parse(event.data) as { type: string; settings?: WallDeckSettings; entities?: HomeAssistantSelectedState[]; homeAssistantStates?: HomeAssistantSelectedState[] };
      if (message.type === "settings.changed" && message.settings) setSettings(message.settings);
      if (message.type === "ha.stateChanged") setHomeAssistant(message.entities ?? []);
      if (message.type === "snapshot") setHomeAssistant(message.homeAssistantStates ?? []);
    }, () => { api.settings().then(setSettings).catch(() => undefined); });
    return () => socket.close();
  }, []);

  if (error) return <div className="panel-state"><strong>Nie udało się uruchomić albumu</strong><span>{error}</span></div>;
  if (!settings) return <div className="panel-state panel-state--loading"><span>WallDeck</span></div>;

  return (
    <main className="photo-view" onContextMenu={e => e.preventDefault()} onPointerDown={e => {
      if (dialog || menuOpen || !e.isPrimary) return;
      cancelHold();
      const current = { x: e.clientX, y: e.clientY, held: false, timer: setTimeout(() => { current.held = true; setDialog("menu"); }, settings.gallery.holdMilliseconds) };
      touch.current = current;
    }} onPointerMove={e => { if (touch.current && Math.hypot(e.clientX - touch.current.x, e.clientY - touch.current.y) > 14) cancelHold(); }} onPointerCancel={() => { cancelHold(); touch.current = null; }} onPointerUp={e => {
      cancelHold(); const start = touch.current; touch.current = null;
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (start.held || dialog) { e.stopPropagation(); return; }
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { e.stopPropagation(); navigate(dx < 0 ? 1 : -1); }
    }}>
      <AnimatePresence mode="sync" initial={false}>
        {layout && <motion.section
          key={layout.key}
          className={`photo-layout photo-layout--${layout.kind} ${landscapeScreen ? "is-landscape" : "is-portrait"}`}
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.005 }}
          transition={{ duration: settings.transitionSeconds, ease: [0.22, 1, 0.36, 1] }}
        >
          {layout.items.map((photo) => <CroppedPhoto key={photo.id} photo={photo} landscape={landscapeScreen} />)}
        </motion.section>}
      </AnimatePresence>
      <div className="photo-view__vignette" />
      <Overlay settings={settings} weather={weather} homeAssistant={homeAssistant} />
      {!layout && <div className="photo-empty"><h2>Twoja ramka czeka na zdjęcia</h2><button onPointerUp={e => e.stopPropagation()} onClick={() => setDialog("menu")}>Otwórz kolekcję</button><p>{library.error}</p></div>}
      {dialog && <div className="photo-dialog-backdrop" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) setDialog(null); }}><section className="photo-dialog" role="dialog" aria-modal="true" aria-label="Zdjęcia" onKeyDown={e => { if (e.key === "Escape") setDialog(null); }}><header><div><small>TWOJA RAMKA</small><h2>Zdjęcia</h2></div><button aria-label="Zamknij zdjęcia" onClick={() => setDialog(null)}>×</button></header><PhotoSyncControls count={library.photos.length} {...library} />{dialog === "menu" ? <button onClick={() => setDialog("library")}>▧ Wszystkie zdjęcia</button> : <PhotoLibrary photos={library.photos} onSelect={photo => { const next: PhotoLayout = { key: photo.id, kind: "single", items: [photo] }; setHistory(old => { const items = [...old.items.slice(0, old.index + 1), next].slice(-100); return { items, index: items.length - 1 }; }); setDialog(null); setTick(t => t + 1); }} />}</section></div>}
    </main>
  );
}
