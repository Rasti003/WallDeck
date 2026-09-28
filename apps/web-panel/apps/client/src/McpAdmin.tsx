import type { Dispatch, FormEvent, SetStateAction } from "react";
import { mcpToolIds, type McpToolId, type WallDeckSettings } from "@walldeck/contracts";

const tools: Record<McpToolId, { name: string; description: string; kind: "odczyt" | "akcja" }> = {
  get_status: { name: "Stan WallDeck", description: "Aktywny widok, tablet, Home Assistant i dostępne narzędzia.", kind: "odczyt" },
  show_view: { name: "Przełączanie widoku", description: "Zdjęcia, Dom, Music lub ekran asystenta.", kind: "akcja" },
  show_assistant_mood: { name: "Mimika asystenta", description: "Pokazanie konkretnego nastroju lub stanu twarzy.", kind: "akcja" },
  control_music: { name: "Sterowanie muzyką", description: "Play, pauza, następny, poprzedni, seek, shuffle i repeat.", kind: "akcja" },
  set_tablet_volume: { name: "Głośność tabletu", description: "Zmiana poziomu multimediów aktywnego wyjścia audio.", kind: "akcja" },
  send_notification: { name: "Powiadomienia i alarmy", description: "Komunikaty globalne z czasem, priorytetem i dźwiękiem.", kind: "akcja" },
  set_view_brightness: { name: "Jasność widoku", description: "Trwała zmiana jasności wybranego widoku.", kind: "akcja" },
  search_home_entities: { name: "Wyszukiwanie encji HA", description: "Odnajdywanie entity_id po nazwie lub domenie.", kind: "odczyt" },
  get_home_entity: { name: "Stan encji HA", description: "Odczyt aktualnego stanu jednej wskazanej encji.", kind: "odczyt" },
};

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
      <p className="form-intro">Serwer MCP udostępnia modelowi mały, kontrolowany zestaw funkcji WallDeck. Wyłączone narzędzie znika z listy MCP i model nie może go wywołać.</p>
      <label className="switch-row"><input type="checkbox" checked={settings.mcp.enabled} onChange={event => setSettings(current => ({ ...current, mcp: { ...current.mcp, enabled: event.target.checked } }))} /><span><strong>Włącz serwer MCP</strong><small>Endpoint: <code>{location.origin}/mcp</code></small></span></label>
      <p className="form-intro">Dostęp wymaga tokenu zapisanego wyłącznie na serwerze. Dla OpenAI API połączymy prywatny homelab przez Secure MCP Tunnel albo docelowe HTTPS — bez publicznego wystawiania obecnego panelu HTTP.</p>
    </section>
    <section className="admin-card">
      <span className="admin-kicker">Zakres dostępu</span><h2>Aktywne funkcje</h2>
      <div className="mcp-tool-list">
        {mcpToolIds.map(id => <label className="switch-row" key={id}>
          <input type="checkbox" checked={settings.mcp.tools[id]} disabled={!settings.mcp.enabled} onChange={event => updateTool(id, event.target.checked)} />
          <span><strong>{tools[id].name}</strong><small><b>{tools[id].kind}</b> · {tools[id].description}</small></span>
        </label>)}
      </div>
    </section>
    <section className="admin-card">
      <span className="admin-kicker">Celowo poza zakresem</span><h2>Funkcje wymagające osobnej decyzji</h2>
      <p className="form-intro">MCP nie może obecnie wyjść z kiosku, zmienić sekretów, wykonać dowolnej usługi Home Assistant ani edytować całego pliku ustawień. TTS, wake word i rozmowa przez OpenAI API pozostają kolejnymi etapami.</p>
    </section>
    <footer className="admin-card assistant-settings-save"><span role="status">{status}</span><button type="submit">Zapisz ustawienia MCP</button></footer>
  </form>;
}
