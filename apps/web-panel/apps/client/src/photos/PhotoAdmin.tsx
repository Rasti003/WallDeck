import { useEffect, useRef, useState } from "react";
import { defaultPhotoEdit, type PhotoEdit, type PhotoItem } from "@walldeck/contracts";
import { api } from "../api";
import { CroppedPhoto } from "./CroppedPhoto";
import { PhotoLibrary, PhotoSyncControls } from "./PhotoLibrary";
import { usePhotos } from "./usePhotos";
export function PhotoAdmin() {
  const library = usePhotos();
  const [selected, setSelected] = useState<PhotoItem | null>(null);
  return <section className="admin-card photo-admin"><h2>Twoja kolekcja</h2><PhotoSyncControls count={library.photos.length} {...library} /><PhotoLibrary photos={library.photos} onSelect={setSelected} />{selected && <PhotoEditor key={selected.id} photo={selected} photos={library.photos} onClose={() => setSelected(null)} onSaved={() => { library.refresh(); setSelected(null); }} />}</section>;
}
function PhotoEditor({ photo, photos, onClose, onSaved }: { photo: PhotoItem; photos: PhotoItem[]; onClose: () => void; onSaved: () => void }) {
  const [edit, setEdit] = useState<PhotoEdit>(structuredClone(photo.edit ?? defaultPhotoEdit));
  const [landscape, setLandscape] = useState(true);
  const [paired, setPaired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ratio, setRatio] = useState(2048 / 1280);
  useEffect(() => { void api.devices().then(devices => { const screen = devices.find(d => d.online)?.screen; if (screen?.width && screen.height) setRatio(Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height)); }).catch(() => undefined); }, []);
  const drag = useRef<{ x: number; y: number; cropX: number; cropY: number; width: number; height: number } | null>(null);
  const key = landscape ? "landscape" : "portrait";
  const crop = edit[key];
  const update = (change: Partial<typeof crop>) => setEdit(e => ({ ...e, [key]: { ...e[key], ...change } }));
  const other = photos.find(p => p.id !== photo.id && p.orientation === (landscape ? "portrait" : "landscape")) ?? photo;
  const save = async () => { setSaving(true); setError(""); try { await api.savePhoto(photo.id, edit); onSaved(); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } };
  return <div className="photo-dialog-backdrop"><section className="photo-dialog photo-editor" role="dialog" aria-modal="true" aria-label="Kadrowanie zdjęcia" onKeyDown={e => { if (e.key === "Escape" && !saving) onClose(); }}>
    <header><div><small>EDYTOR ZDJĘCIA</small><h2>W Twojej ramce</h2></div><button type="button" disabled={saving} onClick={onClose} aria-label="Zamknij edytor">×</button></header>
    <div className="photo-editor__controls"><button type="button" aria-pressed={landscape} onClick={() => setLandscape(true)}>▭ Poziomo</button><button type="button" aria-pressed={!landscape} onClick={() => setLandscape(false)}>▯ Pionowo</button><label><input type="checkbox" checked={paired} onChange={e => setPaired(e.target.checked)} /> Para zdjęć</label><button type="button" onClick={() => setEdit(e => ({ ...e, rotation: ((e.rotation + 90) % 360) as PhotoEdit["rotation"] }))}>↻ Obróć 90°</button></div>
    <div className={`tablet-preview ${landscape ? "landscape" : "portrait"}`} style={{ width: landscape ? "100%" : `min(100%, ${38 * 1 / ratio}vh)` }}><div className={`tablet-preview__screen ${paired ? "paired" : ""}`} style={{ aspectRatio: landscape ? ratio : 1 / ratio }}>
      <div className="photo-crop-drag" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const rect = e.currentTarget.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y, width: rect.width, height: rect.height }; }} onPointerMove={e => { const d = drag.current; if (d) update({ x: Math.max(0, Math.min(1, d.cropX - (e.clientX - d.x) / d.width)), y: Math.max(0, Math.min(1, d.cropY - (e.clientY - d.y) / d.height)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><CroppedPhoto photo={{ ...photo, edit }} landscape={landscape} /><div className="crop-guides" /></div>
      {paired && <CroppedPhoto photo={other} landscape={landscape} />}
    </div></div>
    <p>Przeciągnij zdjęcie, aby ustawić kadr. Osobny kadr dla poziomego i pionowego ekranu. Obrót dotyczy obu orientacji.</p>
    <label>Przybliżenie {crop.zoom.toFixed(2)}×<input type="range" min="1" max="4" step="0.01" value={crop.zoom} onChange={e => update({ zoom: Number(e.target.value) })} /></label>
    <label>Położenie poziome<input type="range" min="0" max="1" step="0.01" value={crop.x} onChange={e => update({ x: Number(e.target.value) })} /></label><label>Położenie pionowe<input type="range" min="0" max="1" step="0.01" value={crop.y} onChange={e => update({ y: Number(e.target.value) })} /></label>
    <label><input type="checkbox" checked={edit.hidden} onChange={e => setEdit(v => ({ ...v, hidden: e.target.checked }))} /> Ukryj w automatycznym pokazie</label>
    {error && <p role="alert">{error}</p>}<footer><button type="button" disabled={saving} onClick={() => setEdit(structuredClone(defaultPhotoEdit))}>Przywróć oryginał</button><button type="button" disabled={saving} onClick={save}>{saving ? "Zapisywanie…" : "Zapisz kadr"}</button></footer>
  </section></div>;
}
