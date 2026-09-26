import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { defaultSettings, type ViewId, type WallDeckSettings } from "@walldeck/contracts";
import { api } from "./api";
import { connectEvents } from "./events";
import { nativeBridge } from "./native";
import { inactivityTransition, viewAfterActivity, viewAfterSwipeDown, viewAfterTap } from "./view-manager";
import { viewRegistry } from "./views/registry";
import { PanelContext } from "./panel-context";

export function PanelApp({ forcedView }: { forcedView?: ViewId }) {
  const reducedMotion = useReducedMotion();
  const [viewId, setViewId] = useState<ViewId>("photos");
  const [settings, setSettings] = useState<WallDeckSettings>(defaultSettings);
  const [assistantIdleTransition, setAssistantIdleTransition] = useState(false);
  const connection = useRef<ReturnType<typeof connectEvents> | null>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptionPending = useRef(false);

  useEffect(() => {
    if (nativeBridge.available) {
      nativeBridge.call("keepAwake", { enabled: true }).catch(() => undefined);
    }
    if (!forcedView) api.views().then((views) => setViewId(views.current)).catch(() => undefined);
    api.settings().then(setSettings).catch(() => undefined);
    const socket = connectEvents((event) => {
      const message = JSON.parse(event.data) as { type: string; viewId?: ViewId; settings?: WallDeckSettings };
      if (!forcedView && (message.type === "snapshot" || message.type === "view.activated") && message.viewId) {
        setViewId(message.viewId);
        if (message.viewId !== "assistant-expressive") setAssistantIdleTransition(false);
      }
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
    const transition = inactivityTransition(activeView, settings.viewRouter, assistantIdleTransition);
    if (forcedView || !transition) return;
    idleTimer.current = setTimeout(() => {
      if (transition.startsAssistantIdle) {
        interruptionPending.current = false;
        setAssistantIdleTransition(true);
      }
      if (transition.completesAssistantIdle) setAssistantIdleTransition(false);
      activate(transition.target);
    }, transition.seconds * 1_000);
  }, [activeView, activate, assistantIdleTransition, forcedView, settings.viewRouter]);

  const registerActivity = useCallback(() => {
    const target = viewAfterActivity(activeView, settings.viewRouter, assistantIdleTransition);
    if (target) {
      if (interruptionPending.current) return;
      interruptionPending.current = true;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      setAssistantIdleTransition(false);
      activate(target);
      return;
    }
    resetInactivity();
  }, [activeView, activate, assistantIdleTransition, resetInactivity, settings.viewRouter]);

  useEffect(() => {
    resetInactivity();
    let lastSent = 0;
    const activity = () => {
      registerActivity();
      if (Date.now() - lastSent > 500 && connection.current) {
        lastSent = Date.now();
        connection.current.send(JSON.stringify({ type: "panel.activity" }));
      }
    };
    window.addEventListener("walldeck:remoteActivity", registerActivity);
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    window.addEventListener("wallpanel:userInteraction", activity);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("walldeck:remoteActivity", registerActivity);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("wallpanel:userInteraction", activity);
    };
  }, [registerActivity, resetInactivity]);

  useEffect(() => {
    if (activeView !== "assistant-expressive") interruptionPending.current = false;
  }, [activeView]);

  useEffect(() => {
    const assistantStateChanged = (event: Event) => {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (!assistantIdleTransition || state === "idle") return;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      setAssistantIdleTransition(false);
    };
    window.addEventListener("walldeck:assistantStateChanged", assistantStateChanged);
    return () => window.removeEventListener("walldeck:assistantStateChanged", assistantStateChanged);
  }, [assistantIdleTransition]);

  useEffect(() => {
    if (nativeBridge.available && activeView !== "assistant-expressive") {
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
      <PanelContext.Provider value={{ settings, activeView }}>
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
      </PanelContext.Provider>
    </div>
  );
}
