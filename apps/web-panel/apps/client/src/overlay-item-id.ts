interface BrowserCrypto {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
}

export function createOverlayItemId(browserCrypto: BrowserCrypto | null | undefined = globalThis.crypto): string {
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID();

  if (typeof browserCrypto?.getRandomValues === "function") {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }

  return `overlay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
