import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { defaultSettings, type ViewId, type WallDeckSettings } from "@walldeck/contracts";
import { api } from "./api";
import { connectEvents } from "./events";
import { nativeBridge } from "./native";
import { inactivityTarget, viewAfterSwipeDown, viewAfterTap } from "./view-manager";
import { viewRegistry } from "./views/registry";

export function PanelApp({ forcedView }: { forcedView?: ViewId }) {
  const reducedMotion = useReducedMotion();
  const [viewId, setViewId] = useState<ViewId>("photos");
  const [settings, setSettings] = useState<WallDeckSettings>(defaultSettings);
  const connection = useRef<ReturnType<typeof connectEvents> | null>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (nativeBridge.available) {
      nativeBridge.call("keepAwake", { enabled: true }).catch(() => undefined);
    }
    if (!forcedView) api.views().then((views) => setViewId(views.current)).catch(() => undefined);
    api.settings().then(setSettings).catch(() => undefined);
    const socket = connectEvents((event) => {
      const message = JSON.parse(event.data) as { type: string; viewId?: ViewId; settings?: WallDeckSettings };
      if (!forcedView && (message.type === "snapshot" || message.type === "view.activated") && message.viewId) setViewId(message.viewId);
      if (message.type === "panel.activity") window.dispatchEvent(new Event("walldeck:remoteActivity"));
      if (message.type === "settings.changed" && message.settings) setSettings(message.settings);
    }, () => { api.settings().then(setSettings).catch(() => undefined); });
    connection.current = socket;
    return () => {
      socket.close();
      if (nativeBridge.available) nativeBridge.call("keepAwake", { enabled: false }).catch(() => undefined);
    };
  }, [forcedView]);

  const activeView = forcedView ?? viewId;

  const activate = useCallback((nextView: ViewId) => {
    if (forcedView) return;
    setViewId(nextView);
    api.activateView(nextView).catch(() => undefined);
  }, [forcedView]);

  const resetInactivity = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const target = inactivityTarget(activeView, settings.viewRouter);
    if (forcedView || !target) return;
    idleTimer.current = setTimeout(() => activate(target), settings.viewRouter.inactivityAction.seconds * 1_000);
  }, [activeView, activate, forcedView, settings.viewRouter.inactivityAction]);

  useEffect(() => {
    resetInactivity();
    let lastSent = 0;
    const activity = () => {
      resetInactivity();
      if (Date.now() - lastSent > 500 && connection.current) {
        lastSent = Date.now();
        connection.current.send(JSON.stringify({ type: "panel.activity" }));
      }
    };
    window.addEventListener("walldeck:remoteActivity", resetInactivity);
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    window.addEventListener("wallpanel:userInteraction", activity);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("walldeck:remoteActivity", resetInactivity);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("wallpanel:userInteraction", activity);
    };
  }, [resetInactivity]);

  useEffect(() => {
    if (nativeBridge.available) {
      nativeBridge.call("brightness", { value: settings.viewBrightness[activeView] }).catch(() => undefined);
    }
  }, [settings.viewBrightness, activeView]);

  const View = viewRegistry[activeView];
  const activateSwipeDown = useCallback(() => {
    const target = viewAfterSwipeDown(activeView, settings.viewRouter);
    if (!forcedView && target) activate(target);
  }, [activeView, activate, forcedView, settings.viewRouter]);

  useEffect(() => {
    window.addEventListener("wallpanel:swipeDown", activateSwipeDown);
    return () => window.removeEventListener("wallpanel:swipeDown", activateSwipeDown);
  }, [activateSwipeDown]);

  return (
    <div
      className="panel-router"
      data-view={activeView}
      onPointerDown={(event) => { touchStart.current = { x: event.clientX, y: event.clientY, time: Date.now() }; }}
      onPointerCancel={() => { touchStart.current = null; }}
      onPointerUp={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (start.y <= innerHeight * 0.4 && deltaY >= 96 && Math.abs(deltaX) <= deltaY * 0.65 && Date.now() - start.time <= 900) {
          activateSwipeDown();
          return;
        }
        if (Date.now() - start.time > 500 || Math.hypot(deltaX, deltaY) > 16) return;
        const target = viewAfterTap(activeView, settings.viewRouter);
        if (!forcedView && target) activate(target);
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          className="panel-view-transition"
          data-rendered-view={activeView}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reducedMotion ? 0 : .25 } }}
          exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : activeView === "assistant-expressive" ? .65 : .2, delay: reducedMotion ? 0 : activeView === "assistant-expressive" ? .2 : 0 } }}
        >
          <View />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
