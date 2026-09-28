import { useEffect, useState } from "react";
export function PhotoCaption({ id }: { id: string }) {
  const [metadata, setMetadata] = useState<{ takenOn: string | null; place: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setMetadata(null);
    void fetch(`/api/photos/${encodeURIComponent(id)}/metadata`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(data => { if (!controller.signal.aborted) setMetadata(data); }).catch(() => undefined);
    return () => controller.abort();
  }, [id]);
  if (!metadata?.takenOn && !metadata?.place) return null;
  const date = metadata.takenOn?.split("-").reverse().join(".");
  return <div className="photo-caption">{date && <time dateTime={metadata.takenOn!}>{date}</time>}{date && metadata.place && <span aria-hidden="true">·</span>}{metadata.place && <span>{metadata.place}</span>}</div>;
}
