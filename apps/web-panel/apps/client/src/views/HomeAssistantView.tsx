import { useEffect, useState } from "react";
import type { HomeAssistantStatus } from "@walldeck/contracts";
import { api } from "../api";
import { connectEvents } from "../events";

export function HomeAssistantView() {
  const [status, setStatus] = useState<HomeAssistantStatus | null>(null);

  useEffect(() => {
    api.homeAssistant.config().then(setStatus).catch(() => undefined);
    const socket = connectEvents((event) => {
      const message = JSON.parse(event.data) as { type: string; status?: HomeAssistantStatus; homeAssistant?: HomeAssistantStatus };
      if (message.type === "ha.statusChanged" && message.status) setStatus(message.status);
      if (message.type === "snapshot" && message.homeAssistant) setStatus(message.homeAssistant);
    });
    return () => socket.close();
  }, []);

  if (!status) return <div className="panel-state panel-state--loading"><span>Home Assistant</span></div>;
  if (!status.dashboardUrl) return <div className="panel-state"><strong>Brak dashboardu Home Assistant</strong><span>Ustaw jego adres w panelu /admin.</span></div>;
  return (
    <main className="ha-view">
      <iframe
        title="Home Assistant"
        src={status.dashboardUrl}
        sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
        referrerPolicy="no-referrer"
      />
      {!status.connected && <div className="ha-view__status">WallDeck ponownie łączy się z Home Assistant…</div>}
    </main>
  );
}
