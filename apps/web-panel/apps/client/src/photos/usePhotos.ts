import { useCallback, useEffect, useState } from "react";
import type { PhotoItem, PhotoSyncStatus } from "@walldeck/contracts";
import { api } from "../api";
import { connectEvents } from "../events";
export function usePhotos() {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [status, setStatus] = useState<PhotoSyncStatus>({ running: false, lastSyncAt: null, error: null, downloaded: 0 });
  const [error, setError] = useState("");
  const refresh = useCallback(() => { void api.photos().then(setPhotos).catch(() => setError("Nie udało się wczytać zdjęć")); void api.photoSyncStatus().then(setStatus).catch(() => undefined); }, []);
  useEffect(() => { refresh(); const events = connectEvents(e => { const m = JSON.parse(e.data); if (m.type === "photos.changed") refresh(); if (m.type === "photos.sync") setStatus(m.status); }, refresh); return () => events.close(); }, [refresh]);
  const sync = async () => { setError(""); try { setStatus(await api.syncPhotos()); } catch (e) { setError((e as Error).message); } };
  return { photos, status, error, sync, refresh };
}
