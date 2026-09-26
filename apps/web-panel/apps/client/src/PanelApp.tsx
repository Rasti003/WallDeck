import { useEffect, useState } from "react";
import { defaultSettings, type ViewId, type WallDeckSettings } from "@walldeck/contracts";
import { api } from "./api";
import { nativeBridge } from "./native";
import { viewRegistry } from "./views/registry";

export function PanelApp({ forcedView }: { forcedView?: ViewId }) {
  const [viewId, setViewId] = useState<ViewId>("photos");
  const [settings, setSettings] = useState<WallDeckSettings>(defaultSettings);

  useEffect(() => {
    if (nativeBridge.available) {
      nativeBridge.call("keepAwake", { enabled: true }).catch(() => undefined);
    }
    if (!forcedView) api.views().then((views) => setViewId(views.current)).catch(() => undefined);
    api.settings().then(setSettings).catch(() => undefined);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/events`);
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string; viewId?: ViewId; settings?: WallDeckSettings };
      if (!forcedView && (message.type === "snapshot" || message.type === "view.activated") && message.viewId) setViewId(message.viewId);
      if (message.type === "settings.changed" && message.settings) setSettings(message.settings);
    };
    return () => {
      socket.close();
      if (nativeBridge.available) nativeBridge.call("keepAwake", { enabled: false }).catch(() => undefined);
    };
  }, [forcedView]);

  const activeView = forcedView ?? viewId;

  useEffect(() => {
    if (nativeBridge.available) {
      nativeBridge.call("brightness", { value: settings.viewBrightness[activeView] }).catch(() => undefined);
    }
  }, [settings.viewBrightness, activeView]);

  const View = viewRegistry[activeView];
  return <View />;
}
