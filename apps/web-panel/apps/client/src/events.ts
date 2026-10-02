const entryScriptPattern = /<script\b[^>]*\bsrc=["']([^"']*\/assets\/index-[^"']+\.js)["'][^>]*>/i;

export function clientEntryPathFromHtml(html: string, pageHref: string) {
  const source = entryScriptPattern.exec(html)?.[1];
  if (!source) return null;
  try { return new URL(source, pageHref).pathname; } catch { return null; }
}

export function shouldReloadClient(currentScriptSrc: string, freshHtml: string, pageHref: string) {
  const freshPath = clientEntryPathFromHtml(freshHtml, pageHref);
  if (!freshPath) return false;
  try { return new URL(currentScriptSrc, pageHref).pathname !== freshPath; } catch { return false; }
}

async function reloadIfClientBuildChanged() {
  if (typeof document === "undefined" || typeof location === "undefined") return false;
  const currentScript = Array.from(document.scripts)
    .map((script) => script.src)
    .find((source) => /\/assets\/index-[^/]+\.js(?:$|\?)/.test(source));
  if (!currentScript) return false;
  try {
    const response = await fetch(location.pathname || "/", {
      cache: "no-store",
      headers: { accept: "text/html" },
    });
    if (!response.ok) return false;
    if (!shouldReloadClient(currentScript, await response.text(), location.href)) return false;
    location.reload();
    return true;
  } catch {
    return false;
  }
}

export function connectEvents(onmessage: (event: MessageEvent) => void, onopen?: () => void) {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let attempts = 0;
  function connect() {
    if (stopped) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const next = new WebSocket(`${protocol}//${location.host}/api/events`);
    socket = next;
    next.onmessage = onmessage;
    next.onopen = () => {
      attempts = 0;
      onopen?.();
      void reloadIfClientBuildChanged();
    };
    next.onerror = () => next.close();
    next.onclose = () => {
      if (stopped) return;
      timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000) + Math.random() * 300);
    };
  }
  connect();
  return {
    send(value: string) { if (socket?.readyState === WebSocket.OPEN) socket.send(value); },
    close() {
      stopped = true;
      clearTimeout(timer);
      if (socket) { socket.onmessage = null; socket.onopen = null; socket.onclose = null; socket.onerror = null; socket.close(); }
    },
  };
}
