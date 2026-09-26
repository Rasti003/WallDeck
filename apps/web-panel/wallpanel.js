// Load only on the configured, trusted main-frame panel origin.
(() => {
  const pending = new Map(); let seq = 0;
  const native = window.WallPanelNative;
  window.WallPanel = {
    call(method, args = {}) {
      return new Promise((resolve, reject) => {
        if (!native) return reject(new Error('Native bridge unavailable'));
        const id = String(++seq);
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Bridge timeout')); }, 5000);
        pending.set(id, { resolve, reject, timeout });
        native.postMessage(JSON.stringify({ id, method, args }));
      });
    }
  };
  if (native) native.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.event) return window.dispatchEvent(new CustomEvent('wallpanel:' + msg.event, { detail: msg.data }));
    const request = pending.get(msg.id); if (!request) return;
    clearTimeout(request.timeout); pending.delete(msg.id);
    msg.error ? request.reject(new Error(msg.error)) : request.resolve(msg.result);
  };
})();
