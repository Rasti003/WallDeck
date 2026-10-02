import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings } from "@walldeck/contracts";
import { executeLiveTool, liveTools } from "../dist/live-tools.js";

function dependencies(calls) {
  return {
    currentView: () => "photos",
    devices: () => [{ deviceId: "wall-tablet", connected: true }],
    spotifyStatus: () => ({ configured: true, connected: true, account: "Test", lastError: null, redirectUri: "http://127.0.0.1/callback" }),
    searchSpotify: async () => [],
    activateView: view => calls.push(["view", view]),
    panelCommand: async (name, args) => { calls.push([name, args]); return { ok: true }; },
  };
}

test("Live tools respect their switches and adjust volume relatively", async () => {
  const enabled = structuredClone(defaultSettings.mcp.tools);
  enabled.adjust_tablet_volume = false;
  assert.ok(!liveTools(enabled).some(tool => tool.name === "adjust_tablet_volume"));

  enabled.adjust_tablet_volume = true;
  const calls = [];
  await executeLiveTool("adjust_tablet_volume", JSON.stringify({ deltaPercent: 10 }), dependencies(calls));
  assert.deepEqual(calls, [["tablet.volume.adjust", { delta: 0.1 }]]);
});

test("GPT-Live exposes and executes the current time tool", async () => {
  const enabled = structuredClone(defaultSettings.mcp.tools);
  assert.ok(liveTools(enabled).some(tool => tool.name === "get_current_time"));

  const result = await executeLiveTool("get_current_time", "{}", dependencies([]));
  assert.equal(result.timeZone, "Europe/Warsaw");
  assert.match(result.localDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.localTime, /^\d{2}:\d{2}:\d{2}$/);
  assert.match(result.isoUtc, /^\d{4}-\d{2}-\d{2}T/);
});
