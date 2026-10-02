import assert from "node:assert/strict";
import test from "node:test";
import { defaultSettings, mcpToolIds } from "@walldeck/contracts";
import { executeLiveTool, liveTools } from "../dist/live-tools.js";

function dependencies(calls) {
  let settings = structuredClone(defaultSettings);
  return {
    readSettings: async () => settings,
    writeSettings: async next => (settings = next),
    currentView: () => "photos",
    devices: () => [{ deviceId: "wall-tablet", connected: true }],
    homeAssistantStatus: () => ({ connected: true }),
    searchHomeEntities: query => [{ entityId: "sensor.salon", friendlyName: "Salon", state: "22" }].filter(entity => entity.friendlyName.toLowerCase().includes((query ?? "").toLowerCase())),
    homeEntity: entityId => entityId === "sensor.salon" ? { entityId, friendlyName: "Salon", state: "22" } : null,
    spotifyStatus: () => ({ configured: true, connected: true, account: "Test", lastError: null, redirectUri: "http://127.0.0.1/callback" }),
    searchSpotify: async () => [],
    spotifyQueue: async () => ({ currentlyPlaying: null, items: [] }),
    spotifyPlaylists: async () => [],
    activateView: view => calls.push(["view", view]),
    notify: notification => calls.push(["notification", notification]),
    panelCommand: async (name, args) => { calls.push([name, args]); return { ok: true }; },
    listSchedules: () => [],
    createTimer: async input => ({ ...input, id: "timer", kind: "timer", repeatDays: [], status: "scheduled" }),
    createAlarm: async input => ({ ...input, id: "alarm", kind: "alarm", status: "scheduled" }),
    cancelSchedule: async id => ({ ok: true, id }),
    dismissSchedule: async id => ({ ok: true, id }),
    snoozeSchedule: async (id, minutes) => ({ ok: true, id, minutes }),
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

test("GPT-Live derives its complete tool list from the shared assistant registry", () => {
  const names = liveTools(structuredClone(defaultSettings.mcp.tools)).map(tool => tool.name);
  assert.deepEqual(names, [...mcpToolIds]);
});

test("GPT-Live executes tools that were previously available only through MCP", async () => {
  const result = await executeLiveTool("get_home_entity", JSON.stringify({ entityId: "sensor.salon" }), dependencies([]), structuredClone(defaultSettings.mcp.tools));
  assert.equal(result.state, "22");
});
