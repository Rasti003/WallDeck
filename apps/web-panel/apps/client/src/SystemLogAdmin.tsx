import { useEffect, useMemo, useState } from "react";
import type { DiagnosticEntry } from "@walldeck/contracts";
import { api } from "./api";

const categoryLabels: Record<DiagnosticEntry["category"], string> = {
  tablet: "Tablet", assistant: "Asystent", scheduler: "Harmonogram", "home-assistant": "Home Assistant", client: "Interfejs", server: "Serwer",
};
const levelIcons: Record<DiagnosticEntry["level"], string> = { info: "•", warning: "!", error: "×" };

export function SystemLogAdmin() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [scope, setScope] = useState<"errors" | "activity">("errors");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("Ładowanie dziennika…");
  const refresh = () => api.diagnostics.list().then(value => { setEntries(value); setState(`Zaktualizowano ${new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`); }).catch(error => setState(`Błąd: ${error instanceof Error ? error.message : String(error)}`));
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 10_000); return () => clearInterval(timer); }, []);

  const errorCount = entries.filter(entry => entry.level === "error").length;
  const activityCount = entries.filter(entry => entry.category === "tablet").length;
  const visible = useMemo(() => entries.filter(entry => {
    if (scope === "errors" && entry.level !== "error") return false;
    if (scope === "activity" && entry.category !== "tablet") return false;
    if (category !== "all" && entry.category !== category) return false;
    const normalized = query.trim().toLocaleLowerCase("pl");
    return !normalized || `${entry.title} ${entry.message} ${entry.details ?? ""} ${categoryLabels[entry.category]}`.toLocaleLowerCase("pl").includes(normalized);
  }), [category, entries, query, scope]);

  async function clearVisible() {
    const label = scope === "errors" ? "błędy" : "aktywność tabletu";
    if (!window.confirm(`Usunąć zapisaną historię: ${label}?`)) return;
    setState("Czyszczenie…");
    await api.diagnostics.clear(scope);
    await refresh();
  }

  return <section className="diagnostic-log">
    <div className="diagnostic-summary">
      <button type="button" className={scope === "errors" ? "is-active is-errors" : "is-errors"} onClick={() => { setScope("errors"); setCategory("all"); }}><span>×</span><small>BŁĘDY</small><strong>{errorCount}</strong><p>Backend, zadania, integracje i interfejs</p></button>
      <button type="button" className={scope === "activity" ? "is-active is-activity" : "is-activity"} onClick={() => { setScope("activity"); setCategory("all"); }}><span>⌁</span><small>AKTYWNOŚĆ TABLETU</small><strong>{activityCount}</strong><p>Połączenie, ekran, wake word, bateria i zasilanie</p></button>
    </div>
    <article className="admin-card diagnostic-card">
      <header>
        <div><span className="admin-kicker">TRWAŁY DZIENNIK</span><h2>{scope === "errors" ? "Błędy systemu" : "Aktywność tabletu"}</h2><p>Do 1000 ostatnich zdarzeń. Historia pozostaje po restarcie i wdrożeniu.</p></div>
        <div className="diagnostic-actions"><button type="button" onClick={() => void refresh()}>Odśwież</button><button type="button" className="is-danger" disabled={!visible.length} onClick={() => void clearVisible()}>Wyczyść</button></div>
      </header>
      <div className="diagnostic-filters">
        <label><span>Szukaj</span><input type="search" placeholder="Tytuł, komunikat lub szczegóły…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        {scope === "errors" && <label><span>Źródło</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Wszystkie źródła</option>{Object.entries(categoryLabels).filter(([key]) => key !== "tablet").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <output>{state}</output>
      </div>
      {!visible.length ? <div className="diagnostic-empty"><i>{scope === "errors" ? "✓" : "◇"}</i><h3>{scope === "errors" ? "Brak zapisanych błędów" : "Brak aktywności tabletu"}</h3><p>Nowe zdarzenia pojawią się tutaj automatycznie.</p></div> : <div className="diagnostic-list">{visible.map(entry => <article className={`diagnostic-entry is-${entry.level}`} key={entry.id}>
        <span className="diagnostic-entry__icon" aria-hidden="true">{levelIcons[entry.level]}</span>
        <div className="diagnostic-entry__body"><header><div><span>{categoryLabels[entry.category]}</span>{entry.deviceId && <code>{entry.deviceId}</code>}</div><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></header><h3>{entry.title}</h3><p>{entry.message}</p>{entry.details && <details><summary>Szczegóły techniczne</summary><pre>{entry.details}</pre></details>}</div>
      </article>)}</div>}
    </article>
  </section>;
}
