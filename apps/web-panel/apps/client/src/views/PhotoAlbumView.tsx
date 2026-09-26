import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeAssistantSelectedState, PhotoItem, WallDeckSettings, WeatherNow } from "@walldeck/contracts";
import { api } from "../api";
import { useLandscape, useNow } from "../hooks";
import { createPhotoLayout, type PhotoLayout } from "./photo-layout";

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
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [settings, setSettings] = useState<WallDeckSettings | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [homeAssistant, setHomeAssistant] = useState<HomeAssistantSelectedState[]>([]);
  const [layout, setLayout] = useState<PhotoLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextLayout = useRef<PhotoLayout | null>(null);

  useEffect(() => {
    Promise.all([api.photos(), api.settings()])
      .then(([photoData, settingsData]) => {
        setPhotos(photoData);
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
    if (!photos.length) return;
    setLayout((previous) => createPhotoLayout(photos, landscapeScreen, previous));
    nextLayout.current = null;
  }, [photos, landscapeScreen]);

  useEffect(() => {
    if (!layout || !photos.length) return;
    const next = createPhotoLayout(photos, landscapeScreen, layout);
    nextLayout.current = next;
    next?.items.forEach((photo) => { const image = new Image(); image.src = photo.url; });
  }, [layout, photos, landscapeScreen]);

  useEffect(() => {
    if (!settings || !photos.length) return;
    const timer = setInterval(() => setLayout((previous) => {
      const next = nextLayout.current ?? createPhotoLayout(photos, landscapeScreen, previous);
      nextLayout.current = null;
      return next;
    }), settings.photoIntervalSeconds * 1_000);
    return () => clearInterval(timer);
  }, [photos, landscapeScreen, settings?.photoIntervalSeconds]);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; settings?: WallDeckSettings; entities?: HomeAssistantSelectedState[]; homeAssistantStates?: HomeAssistantSelectedState[] };
      if (message.type === "settings.changed" && message.settings) setSettings(message.settings);
      if (message.type === "ha.stateChanged") setHomeAssistant(message.entities ?? []);
      if (message.type === "snapshot") setHomeAssistant(message.homeAssistantStates ?? []);
    };
    return () => socket.close();
  }, []);

  const imageStyle = useMemo(() => ({ transitionDuration: `${settings?.transitionSeconds ?? 1.4}s` }), [settings?.transitionSeconds]);

  if (error) return <div className="panel-state"><strong>Nie udało się uruchomić albumu</strong><span>{error}</span></div>;
  if (!settings || !layout) return <div className="panel-state panel-state--loading"><span>WallDeck</span></div>;

  return (
    <main className="photo-view">
      <AnimatePresence mode="sync" initial={false}>
        <motion.section
          key={layout.key}
          className={`photo-layout photo-layout--${layout.kind} ${landscapeScreen ? "is-landscape" : "is-portrait"}`}
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.005 }}
          transition={{ duration: settings.transitionSeconds, ease: [0.22, 1, 0.36, 1] }}
        >
          {layout.items.map((photo) => <img key={photo.id} src={photo.url} alt="" draggable={false} style={imageStyle} />)}
        </motion.section>
      </AnimatePresence>
      <div className="photo-view__vignette" />
      <Overlay settings={settings} weather={weather} homeAssistant={homeAssistant} />
    </main>
  );
}
