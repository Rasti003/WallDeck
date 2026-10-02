import { afterEach, expect, it, vi } from "vitest";
import { clientEntryPathFromHtml, connectEvents, shouldReloadClient } from "./events";

it("detects when the deployed hashed client bundle changed", () => {
  const html = '<script type="module" crossorigin src="/assets/index-new123.js"></script>';
  expect(clientEntryPathFromHtml(html, "http://panel.test/panel")).toBe("/assets/index-new123.js");
  expect(shouldReloadClient("http://panel.test/assets/index-old456.js", html, "http://panel.test/panel")).toBe(true);
  expect(shouldReloadClient("http://panel.test/assets/index-new123.js", html, "http://panel.test/panel")).toBe(false);
});

it("reconnects after disconnect, delivers the new snapshot and stops retrying on cleanup", () => {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((message: unknown) => void) | null = null;
    send = vi.fn();
    constructor() { sockets.push(this); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "panel.test" });
  const message = vi.fn();
  const opened = vi.fn();
  const events = connectEvents(message, opened);
  sockets[0].onopen?.();
  sockets[0].close();
  vi.advanceTimersByTime(1300);
  expect(sockets).toHaveLength(2);
  sockets[1].onopen?.();
  sockets[1].onmessage?.({ data: '{"type":"snapshot","viewId":"ha"}' });
  expect(message).toHaveBeenCalledOnce();
  expect(opened).toHaveBeenCalledTimes(2);
  events.send("activity");
  expect(sockets[1].send).toHaveBeenCalledWith("activity");
  sockets[1].close();
  events.close();
  vi.advanceTimersByTime(30000);
  expect(sockets).toHaveLength(2);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
