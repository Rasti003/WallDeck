import { useEffect, useState, type CSSProperties } from "react";
import type { AssistantCanvasDocument } from "@walldeck/contracts";
import { api } from "../api";
import { connectEvents } from "../events";

export function AssistantCanvasView() {
  const [canvas, setCanvas] = useState<AssistantCanvasDocument | null>(null);
  useEffect(() => {
    let disposed = false;
    const update = (incoming: AssistantCanvasDocument | null) => {
      if (disposed || !incoming) return;
      setCanvas(current => current && (current.revision ?? 0) > (incoming.revision ?? 0) ? current : incoming);
    };
    api.assistant.canvas().then(update).catch(() => undefined);
    const socket = connectEvents(event => {
      const message = JSON.parse(event.data) as { type: string; canvas?: AssistantCanvasDocument | null; assistantCanvas?: AssistantCanvasDocument | null };
      if (message.type === "assistant.canvas" && message.canvas) update(message.canvas);
      if (message.type === "snapshot" && message.assistantCanvas) update(message.assistantCanvas);
    });
    return () => { disposed = true; socket.close(); };
  }, []);

  if (!canvas) return <main className="assistant-canvas assistant-canvas--empty"><div className="canvas-orb"/><span>CANVAS</span><h1>Zapytaj mnie o coś</h1><p>Mogę pokazać informacje z internetu, dane domu, zdjęcia i porównania.</p></main>;
  return <main className="assistant-canvas">
    <div className="canvas-glow" aria-hidden="true" />
    <header className="canvas-header">
      <div><span>{canvas.eyebrow || "ASYSTENT · CANVAS"}</span><h1>{canvas.title}</h1>{canvas.summary && <p>{canvas.summary}</p>}</div>
      <time dateTime={canvas.updatedAt}>{new Date(canvas.updatedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</time>
    </header>

    {!!canvas.metrics.length && <section className="canvas-metrics">{canvas.metrics.map((metric, index) => <article className={`canvas-metric is-${metric.tone}`} style={{ "--delay": `${index * 55}ms` } as CSSProperties} key={`${metric.label}-${index}`}>
      <small>{metric.label}</small><strong>{metric.value}<em>{metric.unit}</em></strong>{metric.note && <p>{metric.note}</p>}
    </article>)}</section>}

    {canvas.status === "preparing" && <div className="canvas-loading" role="status"><i/>Luna przygotowuje prezentację…</div>}
    {canvas.status === "cancelled" && <p className="canvas-notice" role="status">Przygotowanie prezentacji zostało anulowane.</p>}
    {canvas.status === "error" && <p className="canvas-notice" role="status">Nie udało się przygotować tekstu prezentacji. Możesz poprosić ponownie.</p>}
    <div className="canvas-grid">
      {canvas.imagesStatus === "loading" && !canvas.images.length && <section className="canvas-image-placeholder" role="status"><div className="canvas-orb"/><span>Dobieram zdjęcia</span><small>Możesz dalej słuchać odpowiedzi</small></section>}
      {canvas.imagesStatus === "unavailable" && !canvas.images.length && <p className="canvas-notice">Zdjęcia są teraz niedostępne.</p>}
      {!!canvas.images.length && <section className={`canvas-images count-${Math.min(canvas.images.length, 3)}`}>{canvas.images.map((item, index) => <figure key={`${item.url}-${index}`}>
        <img src={item.url} alt={item.alt} referrerPolicy="no-referrer" onError={event => { event.currentTarget.closest("figure")?.classList.add("is-broken"); }} />
        {(item.caption || item.sourceUrl) && <figcaption>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.caption || item.alt}</a> : item.caption}</figcaption>}
      </figure>)}</section>}

      {!!canvas.charts.length && <section className="canvas-charts">{canvas.charts.map((chart, chartIndex) => {
        const max = Math.max(...chart.points.map(point => Math.abs(point.value)), 1);
        return <article className="canvas-chart" key={`${chart.title}-${chartIndex}`}><h2>{chart.title}</h2><div>{chart.points.map((point, index) => <div className="canvas-bar" key={`${point.label}-${index}`}>
          <span>{point.label}</span><i><b style={{ width: `${Math.max(4, Math.abs(point.value) / max * 100)}%`, "--delay": `${index * 70}ms` } as CSSProperties}/></i><strong>{point.value.toLocaleString("pl-PL")}{chart.unit ? ` ${chart.unit}` : ""}</strong>
        </div>)}</div></article>;
      })}</section>}

      {!!canvas.bullets.length && <section className="canvas-bullets"><h2>Najważniejsze</h2><ul>{canvas.bullets.map((item, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ul></section>}
    </div>

    {!!canvas.sources.length && <footer className="canvas-sources"><span>ŹRÓDŁA</span><div>{canvas.sources.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}>{index + 1}. {source.title}</a>)}</div></footer>}
  </main>;
}
