import { useEffect, useState } from "react";
import type { ViewId } from "@walldeck/contracts";
import { api } from "./api";
import { viewRegistry } from "./views/registry";

export function PanelApp() {
  const [viewId, setViewId] = useState<ViewId>("photos");

  useEffect(() => {
    api.views().then((views) => setViewId(views.current)).catch(() => undefined);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; viewId?: ViewId };
      if ((message.type === "snapshot" || message.type === "view.activated") && message.viewId) setViewId(message.viewId);
    };
    return () => socket.close();
  }, []);

  const View = viewRegistry[viewId];
  return <View />;
}
