import type { Dispatch, FormEvent, SetStateAction } from "react";
import { assistantToolCatalog, mcpToolIds, type McpToolId, type WallDeckSettings } from "@walldeck/contracts";

export function McpAdmin({ settings, setSettings, save, status }: {
  settings: WallDeckSettings;
  setSettings: Dispatch<SetStateAction<WallDeckSettings>>;
  save(event: FormEvent): Promise<void>;
  status: string;
}) {
  const updateTool = (id: McpToolId, enabled: boolean) => setSettings(current => ({ ...current, mcp: { ...current.mcp, tools: { ...current.mcp.tools, [id]: enabled } } }));
  return <form className="admin-form mcp-admin" onSubmit={save}>
    <section className="admin-card">
      <span className="admin-kicker">Model Context Protocol</span><h2>Narzędzia asystenta</h2>
      <p className="form-intro">To jedna wspólna lista funkcji dla GPT‑Live, Luny i serwera MCP. Jeden przełącznik narzędzia obowiązuje we wszystkich torach asystenta.</p>
      <label className="switch-row"><input type="checkbox" checked={settings.mcp.enabled} onChange={event => setSettings(current => ({ ...current, mcp: { ...current.mcp, enabled: event.target.checked } }))} /><span><strong>Włącz zewnętrzny serwer MCP</strong><small>Endpoint: <code>{location.origin}/mcp</code></small></span></label>
      <p className="form-intro">Wyłączenie endpointu nie wyłącza narzędzi wbudowanego asystenta. Dostęp zewnętrzny wymaga tokenu zapisanego wyłącznie na serwerze oraz docelowo HTTPS lub bezpiecznego tunelu.</p>
    </section>
    <section className="admin-card">
      <span className="admin-kicker">Zakres dostępu</span><h2>Aktywne funkcje</h2>
      <div className="mcp-tool-list">
        {mcpToolIds.map(id => <label className="switch-row" key={id}>
          <input type="checkbox" checked={settings.mcp.tools[id]} onChange={event => updateTool(id, event.target.checked)} />
          <span><strong>{assistantToolCatalog[id].label}</strong><small><b>{assistantToolCatalog[id].kind}</b> · {assistantToolCatalog[id].summary}</small></span>
        </label>)}
      </div>
    </section>
    <section className="admin-card">
      <span className="admin-kicker">Celowo poza zakresem</span><h2>Funkcje wymagające osobnej decyzji</h2>
      <p className="form-intro">MCP nie może obecnie wyjść z kiosku, zmienić sekretów, wykonać dowolnej usługi Home Assistant ani edytować całego pliku ustawień. Mikrofon tabletu, wake word i STT pozostają kolejnymi etapami.</p>
    </section>
    <footer className="admin-card assistant-settings-save"><span role="status">{status}</span><button type="submit">Zapisz narzędzia asystenta</button></footer>
  </form>;
}
