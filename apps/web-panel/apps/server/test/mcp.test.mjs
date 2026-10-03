import assert from "node:assert/strict";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { defaultSettings, mcpToolIds } from "@walldeck/contracts";
import { createWallDeckMcpServer } from "../dist/mcp.js";
import { currentTimeSnapshot } from "../dist/current-time.js";

function readText(result) {
  return JSON.parse(result.content.find(item => item.type === "text").text);
}

test("MCP exposes only enabled tools and routes focused WallDeck actions", async () => {
  let settings = structuredClone(defaultSettings);
  settings.mcp.enabled = true;
  settings.mcp.tools.control_music = false;
  const calls = [];
  const deps = {
    readSettings: async () => settings,
    writeSettings: async next => (settings = next),
    currentView: () => "photos",
    devices: () => [{ deviceId: "wall-tablet", connected: true }],
    homeAssistantStatus: () => ({ connected: true }),
    searchHomeEntities: query => [{ entityId: "sensor.salon_temperature", friendlyName: "Temperatura salon", state: "22.5", unit: "°C" }].filter(entity => entity.friendlyName.toLowerCase().includes(query.toLowerCase())),
    homeEntity: entityId => entityId === "sensor.salon_temperature" ? { entityId, friendlyName: "Temperatura salon", state: "22.5", unit: "°C" } : null,
    spotifyStatus: () => ({ configured: true, connected: true, account: "Test", lastError: null, redirectUri: "http://127.0.0.1/callback" }),
    searchSpotify: async query => [{ uri: "spotify:track:abc", type: "track", name: query, subtitle: "Artist", image: null }],
    spotifyQueue: async () => ({ currentlyPlaying: null, items: [] }),
    spotifyPlaylists: async () => [],
    activateView: view => calls.push(["view", view]),
    notify: notification => calls.push(["notification", notification]),
    panelCommand: async (name, args) => { calls.push([name, args]); return { ok: true }; },
    listSchedules: () => [],
    createTimer: async input => ({ id: "00000000-0000-4000-8000-000000000001", kind: "timer", label: input.label || "Minutnik", automationPrompt: input.automationPrompt, createdAt: new Date().toISOString(), triggerAt: new Date(Date.now() + input.durationSeconds * 1000).toISOString(), durationSeconds: input.durationSeconds, repeatDays: [], enabled: true, status: "scheduled" }),
    createAlarm: async input => ({ id: "00000000-0000-4000-8000-000000000002", kind: "alarm", label: input.label || "Budzik", automationPrompt: input.automationPrompt, createdAt: new Date().toISOString(), triggerAt: input.triggerAt ?? new Date(Date.now() + 60_000).toISOString(), time: input.time, repeatDays: input.repeatDays, enabled: true, status: "scheduled" }),
    createAssistantTask: async input => ({ id: "00000000-0000-4000-8000-000000000003", kind: "task", label: input.label || "Zadanie asystenta", automationPrompt: input.automationPrompt, createdAt: new Date().toISOString(), triggerAt: input.triggerAt ?? new Date(Date.now() + 60_000).toISOString(), time: input.time, repeatDays: input.repeatDays, enabled: true, status: "scheduled" }),
    setAlarmEnabled: async (id, enabled) => ({ id, kind: "alarm", label: "Budzik", automationPrompt: "", createdAt: new Date().toISOString(), triggerAt: new Date(Date.now() + 60_000).toISOString(), repeatDays: [1], enabled, status: "scheduled" }),
    cancelSchedule: async id => ({ ok: true, id }),
    dismissSchedule: async id => ({ ok: true, id }),
    snoozeSchedule: async (id, minutes) => ({ ok: true, id, minutes }),
  };
  const server = createWallDeckMcpServer(settings, deps);
  const client = new Client({ name: "WallDeck tests", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, mcpToolIds.length - 1);
    assert.ok(listed.tools.some(tool => tool.name === "get_status"));
    assert.ok(listed.tools.some(tool => tool.name === "get_current_time"));
    assert.ok(listed.tools.some(tool => tool.name === "adjust_tablet_volume"));
    assert.ok(!listed.tools.some(tool => tool.name === "control_music"));
    assert.ok(listed.tools.some(tool => tool.name === "create_timer"));
    assert.ok(listed.tools.some(tool => tool.name === "create_assistant_task"));
    assert.ok(listed.tools.some(tool => tool.name === "set_alarm_enabled"));

    const status = readText(await client.callTool({ name: "get_status", arguments: {} }));
    const currentTime = readText(await client.callTool({ name: "get_current_time", arguments: {} }));
    assert.equal(status.currentView, "photos");
    assert.equal(status.homeAssistant.connected, true);
    assert.equal(currentTime.timeZone, "Europe/Warsaw");
    assert.match(currentTime.localTime, /^\d{2}:\d{2}:\d{2}$/);

    await client.callTool({ name: "show_view", arguments: { view: "music" } });
    await client.callTool({ name: "show_assistant_mood", arguments: { mood: "curious" } });
    await client.callTool({ name: "set_tablet_volume", arguments: { percent: 35 } });
    await client.callTool({ name: "adjust_tablet_volume", arguments: { deltaPercent: 10 } });
    await client.callTool({ name: "send_notification", arguments: { message: "Nowe zdjęcia", durationSeconds: 7 } });
    await client.callTool({ name: "speak_on_tablet", arguments: { text: "Przypominam o ziemniakach" } });
    await client.callTool({ name: "start_live_conversation", arguments: { openingMessage: "Czy ustawić minutnik?", context: "Gotowanie ziemniaków" } });
    await client.callTool({ name: "set_view_brightness", arguments: { view: "photos", percent: 40 } });
    const entities = readText(await client.callTool({ name: "search_home_entities", arguments: { query: "salon" } }));
    const entity = readText(await client.callTool({ name: "get_home_entity", arguments: { entityId: "sensor.salon_temperature" } }));
    const spotify = readText(await client.callTool({ name: "search_spotify", arguments: { query: "Test" } }));
    const timer = readText(await client.callTool({ name: "create_timer", arguments: { durationSeconds: 600, label: "Makaron", automationPrompt: "Opowiedz kawał" } }));

    assert.deepEqual(calls[0], ["view", "music"]);
    assert.deepEqual(calls[1], ["assistant.mood", { mood: "curious" }]);
    assert.deepEqual(calls[2], ["tablet.volume", { value: 0.35 }]);
    assert.deepEqual(calls[3], ["tablet.volume.adjust", { delta: 0.1 }]);
    assert.equal(calls[4][0], "notification.show");
    assert.deepEqual(calls[5], ["assistant.speak", { text: "Przypominam o ziemniakach" }]);
    assert.deepEqual(calls[6], ["assistant.startConversation", { openingMessage: "Czy ustawić minutnik?", context: "Gotowanie ziemniaków" }]);
    assert.equal(settings.viewBrightness.photos, 0.4);
    assert.equal(entities.entities.length, 1);
    assert.equal(entity.state, "22.5");
    assert.equal(spotify.items[0].uri, "spotify:track:abc");
    assert.equal(timer.label, "Makaron");
    assert.equal(timer.automationPrompt, "Opowiedz kawał");
  } finally {
    await client.close();
    await server.close();
  }
});

test("current time snapshot respects Warsaw daylight saving time", () => {
  const summer = currentTimeSnapshot(new Date("2026-07-01T10:15:30.000Z"));
  const winter = currentTimeSnapshot(new Date("2026-01-01T10:15:30.000Z"));
  assert.equal(summer.localTime, "12:15:30");
  assert.equal(summer.utcOffset, "GMT+02:00");
  assert.equal(winter.localTime, "11:15:30");
  assert.equal(winter.utcOffset, "GMT+01:00");
});
