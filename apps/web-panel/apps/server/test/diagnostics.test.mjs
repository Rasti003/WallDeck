import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DiagnosticStore } from "../dist/diagnostics.js";

test("diagnostic store persists, filters and clears errors independently", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "walldeck-diagnostics-"));
  const file = path.join(directory, "diagnostics.json");
  try {
    const store = new DiagnosticStore(file, 10);
    await store.add({ level: "info", category: "tablet", title: "Tablet online", message: "Połączono", deviceId: "wallpanel-01" });
    await store.add({ level: "error", category: "scheduler", title: "Błąd zadania", message: "Brak narzędzia", details: "tool unavailable" });
    assert.equal((await store.list("activity")).length, 1);
    assert.equal((await store.list("errors"))[0].details, "tool unavailable");
    assert.equal(JSON.parse(await readFile(file, "utf8")).length, 2);
    const restored = new DiagnosticStore(file, 10);
    assert.equal((await restored.list()).length, 2);
    await restored.clear("errors");
    assert.equal((await restored.list()).length, 1);
    assert.equal((await restored.list())[0].category, "tablet");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
