import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { HomeAssistantClient, HomeAssistantConfigStore } from "../dist/home-assistant.js";

test("token is encrypted at rest and absent from public status", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "walldeck-ha-"));
  try {
    const store = new HomeAssistantConfigStore(root);
    const saved = await store.save({
      baseUrl: "http://homeassistant.local:8123/",
      token: "very-secret-token",
      dashboardUrl: "http://homeassistant.local:8123/lovelace/0",
      overlayEntities: [{ id: "co2", entityId: "sensor.living_room_co2", label: "CO₂", position: "bottom-left" }],
    });
    assert.equal(saved.token, "very-secret-token");
    assert.equal((await store.load()).token, "very-secret-token");
    assert.doesNotMatch(await readFile(path.join(root, "home-assistant.json"), "utf8"), /very-secret-token/);

    const client = new HomeAssistantClient(() => {});
    await client.configure(saved);
    const publicStatus = JSON.stringify(client.status());
    assert.doesNotMatch(publicStatus, /very-secret-token|token/i);
    client.stop();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("selected overlay contains arbitrary configured entities and presentation metadata", () => {
  const client = new HomeAssistantClient(() => {});
  client.config = {
    baseUrl: "http://homeassistant.local:8123",
    dashboardUrl: "",
    token: "test",
    overlayEntities: [
      { id: "temperature", entityId: "sensor.kitchen_temperature", label: "Kuchnia", position: "top-right" },
      { id: "light", entityId: "light.living_room", label: "Salon", position: "bottom-right" },
    ],
  };
  client.entities = new Map([
    ["sensor.kitchen_temperature", { entityId: "sensor.kitchen_temperature", state: "22.4", friendlyName: "Temperatura", unit: "°C", deviceClass: "temperature", lastChanged: "2026-09-26T10:00:00Z" }],
    ["light.living_room", { entityId: "light.living_room", state: "on", friendlyName: "Światło", unit: null, deviceClass: "light", lastChanged: "2026-09-26T10:00:01Z" }],
  ]);
  assert.deepEqual(client.selectedStates().map(({ id, state, label, position }) => ({ id, state, label, position })), [
    { id: "temperature", state: "22.4", label: "Kuchnia", position: "top-right" },
    { id: "light", state: "on", label: "Salon", position: "bottom-right" },
  ]);
  assert.equal(client.entity("sensor.kitchen_temperature")?.state, "22.4");
  assert.equal(client.entity("sensor.missing"), null);
});

test("connection test reads version and entity count with bearer authentication", async () => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer test-token");
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/config") response.end(JSON.stringify({ version: "2026.9.1" }));
    else if (request.url === "/api/states") response.end(JSON.stringify([{ entity_id: "sensor.co2" }, { entity_id: "light.kitchen" }]));
    else { response.statusCode = 404; response.end("{}"); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const client = new HomeAssistantClient(() => {});
    const result = await client.test(`http://127.0.0.1:${address.port}`, "test-token");
    assert.deepEqual(result, { ok: true, version: "2026.9.1", entityCount: 2 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
