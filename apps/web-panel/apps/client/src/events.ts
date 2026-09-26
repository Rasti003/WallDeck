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
    next.onopen = () => { attempts = 0; onopen?.(); };
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
