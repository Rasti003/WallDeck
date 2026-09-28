import { useEffect, useRef, useState } from "react";
import { defaultSettings, type AppNotification, type WallDeckSettings } from "@walldeck/contracts";
import { connectEvents } from "./events";
import { api } from "./api";
import { playNotificationSound } from "./notification-sound";
import { resolveNotificationPresentation } from "./notification-config";

export function notify(notification: AppNotification) { window.dispatchEvent(new CustomEvent("walldeck:notification", { detail: notification })); }

export function Notifications() {
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState(defaultSettings.notifications);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const seen = useRef(new Set<string>());
  const current = queue[0];

  useEffect(() => {
    void api.settings().then(value => setSettings(value.notifications)).catch(() => undefined);
    const accept = (notification: AppNotification) => {
      if (!notification?.id || !notification.message || seen.current.has(notification.id)) return;
      seen.current.add(notification.id);
      if (seen.current.size > 200) seen.current.delete(seen.current.values().next().value!);
      const presentation = resolveNotificationPresentation(notification, settingsRef.current);
      playNotificationSound(presentation.sound, presentation.volume);
      setQueue(items => notification.priority === "alarm" ? [notification, ...items].slice(0, 10) : [...items.slice(-9), notification]);
    };
    const event = (e: Event) => accept((e as CustomEvent<AppNotification>).detail);
    window.addEventListener("walldeck:notification", event);
    const socket = connectEvents(e => {
      const message = JSON.parse(e.data) as { type?: string; notification?: AppNotification; settings?: WallDeckSettings };
      if (message.type === "notification" && message.notification) accept(message.notification);
      if (message.type === "settings.changed" && message.settings) setSettings(message.settings.notifications);
    });
    return () => { socket.close(); window.removeEventListener("walldeck:notification", event); };
  }, []);

  const presentation = current ? resolveNotificationPresentation(current, settings) : null;
  useEffect(() => {
    if (!current || !presentation || presentation.persistent) return;
    const timer = setTimeout(() => setQueue(items => items.slice(1)), presentation.durationMs);
    return () => clearTimeout(timer);
  }, [current?.id, presentation?.persistent, presentation?.durationMs]);

  if (!current || !presentation) return null;
  return <aside className={`app-notification ${presentation.alarm ? "is-alarm" : ""}`} role={presentation.alarm ? "alert" : "status"} aria-live={presentation.alarm ? "assertive" : "polite"} onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
    {presentation.alarm && <b className="app-notification__alarm">ALARM</b>}
    <span>{current.message}</span>
    {current.action === "photos" && <button onClick={() => { setQueue(items => items.slice(1)); if (location.pathname.startsWith("/admin")) window.dispatchEvent(new Event("walldeck:openAdminPhotos")); else { sessionStorage.setItem("openPhotoLibrary", "1"); if (location.pathname !== "/panel" && location.pathname !== "/") location.assign("/panel"); else void api.activateView("photos").then(() => window.dispatchEvent(new Event("walldeck:openPhotoLibrary"))); } }}>Zobacz</button>}
    <button aria-label="Zamknij powiadomienie" onClick={() => setQueue(items => items.slice(1))}>×</button>
  </aside>;
}
