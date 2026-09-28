import { useEffect, useRef, useState } from "react";
import type { AppNotification } from "@walldeck/contracts";
import { connectEvents } from "./events";
import { api } from "./api";
export function notify(notification: AppNotification) { window.dispatchEvent(new CustomEvent("walldeck:notification", { detail: notification })); }
export function Notifications() {
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const seen = useRef(new Set<string>());
  const current = queue[0];
  useEffect(() => {
    const accept = (n: AppNotification) => { if (!n?.id || seen.current.has(n.id)) return; seen.current.add(n.id); if (seen.current.size > 200) seen.current.delete(seen.current.values().next().value!); setQueue(q => [...q.slice(-9), n]); };
    const event = (e: Event) => accept((e as CustomEvent<AppNotification>).detail);
    window.addEventListener("walldeck:notification", event);
    const socket = connectEvents(e => { const m = JSON.parse(e.data); if (m.type === "notification") accept(m.notification); });
    return () => { socket.close(); window.removeEventListener("walldeck:notification", event); };
  }, []);
  useEffect(() => { if (!current) return; const t = setTimeout(() => setQueue(q => q.slice(1)), current.durationMs); return () => clearTimeout(t); }, [current]);
  if (!current) return null;
  return <aside className="app-notification" role="status" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}><span>{current.message}</span>{current.action === "photos" && <button onClick={() => { setQueue(q => q.slice(1)); if (location.pathname.startsWith("/admin")) window.dispatchEvent(new Event("walldeck:openAdminPhotos")); else { sessionStorage.setItem("openPhotoLibrary", "1"); if (location.pathname !== "/panel" && location.pathname !== "/") location.assign("/panel"); else void api.activateView("photos").then(() => window.dispatchEvent(new Event("walldeck:openPhotoLibrary"))); } }}>Zobacz</button>}<button aria-label="Zamknij powiadomienie" onClick={() => setQueue(q => q.slice(1))}>×</button></aside>;
}
