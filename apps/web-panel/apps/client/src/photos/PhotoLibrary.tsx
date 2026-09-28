import { useState } from "react";
import type { PhotoItem, PhotoSyncStatus } from "@walldeck/contracts";
import { CroppedPhoto } from "./CroppedPhoto";
export function PhotoLibrary({ photos, onSelect }: { photos: PhotoItem[]; onSelect: (p: PhotoItem) => void }) {
  const [limit, setLimit] = useState(60);
  return <><div className="photo-library">{photos.slice(0, limit).map((photo, index) => <button type="button" key={photo.id} aria-label={`Zdjęcie ${index + 1}${photo.edit?.hidden ? ", ukryte" : ""}`} onClick={() => onSelect(photo)}><CroppedPhoto photo={photo} landscape thumbnail />{photo.edit?.hidden && <span>Ukryte</span>}</button>)}</div>{limit < photos.length && <button type="button" onClick={() => setLimit(n => n + 60)}>Pokaż kolejne zdjęcia ({photos.length - limit})</button>}{!photos.length && <p>Kolekcja jest pusta. Pobierz nowe zdjęcia.</p>}</>;
}
export function PhotoSyncControls({ count, status, error, sync }: { count: number; status: PhotoSyncStatus; error: string; sync: () => void }) {
  return <div className="photo-sync"><div><strong>{count} zdjęć</strong><small>{status.running ? "Pobieranie nowych zdjęć…" : status.lastSyncAt ? `Ostatnia synchronizacja: ${new Date(status.lastSyncAt).toLocaleString("pl-PL")}` : "Jeszcze nie synchronizowano"}</small>{(error || status.error) && <p role="alert">{error || status.error}</p>}</div><button type="button" disabled={status.running} onClick={sync}>{status.running ? "Sprawdzanie…" : "↓ Pobierz nowe"}</button></div>;
}
