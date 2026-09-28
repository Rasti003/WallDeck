import { useEffect, useRef, useState } from "react";
import { defaultPhotoEdit, type PhotoItem } from "@walldeck/contracts";
import { PhotoCaption } from "./PhotoCaption";
export function photoGeometry(width: number, height: number, boxWidth: number, boxHeight: number, rotation: number, crop: { x: number; y: number; zoom: number }) {
  const swapped = rotation % 180 !== 0;
  const rw = swapped ? height : width, rh = swapped ? width : height;
  const scale = Math.max(boxWidth / rw, boxHeight / rh) * crop.zoom;
  return { width: width * scale, height: height * scale, left: boxWidth / 2 + (boxWidth - rw * scale) * (crop.x - .5), top: boxHeight / 2 + (boxHeight - rh * scale) * (crop.y - .5) };
}
export function CroppedPhoto({ photo, landscape, thumbnail = false, caption = false }: { photo: PhotoItem; landscape: boolean; thumbnail?: boolean; caption?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect)); if (ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  const edit = photo.edit ?? defaultPhotoEdit;
  const style = photoGeometry(photo.width, photo.height, size.width, size.height, edit.rotation, edit[landscape ? "landscape" : "portrait"]);
  return <div ref={ref} className="cropped-photo"><img alt="" draggable={false} loading={thumbnail ? "lazy" : "eager"} src={thumbnail ? photo.thumbnailUrl ?? photo.url : photo.url} style={{ ...style, transform: `translate(-50%, -50%) rotate(${edit.rotation}deg)` }} />{caption && <PhotoCaption id={photo.id} />}</div>;
}
