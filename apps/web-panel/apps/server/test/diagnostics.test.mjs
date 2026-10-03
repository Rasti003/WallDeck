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
    await store.add({ level: "info", category: "scheduler", title: "Wykonano zadanie", message: "Przypomnienie" });
    await store.add({ level: "error", category: "scheduler", title: "Błąd zadania", message: "Brak narzędzia", details: "tool unavailable" });
    assert.deepEqual((await store.list("activity")).map(entry => entry.category), ["scheduler", "tablet"]);
    assert.equal((await store.list("errors"))[0].details, "tool unavailable");
    assert.equal(JSON.parse(await readFile(file, "utf8")).length, 3);
    const restored = new DiagnosticStore(file, 10);
    assert.equal((await restored.list()).length, 3);
    await restored.clear("activity");
    assert.equal((await restored.list()).length, 1);
    assert.equal((await restored.list())[0].level, "error");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
