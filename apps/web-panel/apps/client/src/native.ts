type NativeResult = Record<string, unknown> | boolean | number | string | null;

interface PendingRequest {
  resolve(value: NativeResult): void;
  reject(reason: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

interface NativeMessageEvent {
  data: string;
}

interface NativeBridge {
  postMessage(message: string): void;
  onmessage?: (event: NativeMessageEvent) => void;
}

declare global {
  interface Window {
    WallPanelNative?: NativeBridge;
  }
}

const pending = new Map<string, PendingRequest>();
let sequence = 0;
let listenerInstalled = false;

function installListener() {
  const bridge = window.WallPanelNative;
  if (!bridge || listenerInstalled) return;
  listenerInstalled = true;
  bridge.onmessage = ({ data }) => {
    const message = JSON.parse(data) as { id?: string; event?: string; data?: unknown; result?: NativeResult; error?: string };
    if (message.event) {
      window.dispatchEvent(new CustomEvent(`wallpanel:${message.event}`, { detail: message.data }));
      return;
    }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result ?? null);
  };
}

export const nativeBridge = {
  get available() {
    return Boolean(window.WallPanelNative);
  },

  call(method: string, args: Record<string, unknown> = {}) {
    installListener();
    return new Promise<NativeResult>((resolve, reject) => {
      const bridge = window.WallPanelNative;
      if (!bridge) {
        reject(new Error("Native bridge unavailable"));
        return;
      }
      const id = String(++sequence);
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Native bridge timeout"));
      }, 5_000);
      pending.set(id, { resolve, reject, timeout });
      bridge.postMessage(JSON.stringify({ id, method, args }));
    });
  },
};
