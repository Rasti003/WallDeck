import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AssistantHistoryStore } from "../dist/assistant-history.js";

test("assistant history persists newest-first, applies its limit and can be cleared", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "walldeck-assistant-history-"));
  const file = path.join(root, "history.json");
  try {
    const store = new AssistantHistoryStore(file, 2);
    for (const transcript of ["pierwsza", "druga", "trzecia"]) {
      await store.add({ source: "tablet-voice", startedAt: "2026-10-02T10:00:00.000Z", transcript, error: "test" });
    }
    const restored = new AssistantHistoryStore(file, 2);
    assert.deepEqual((await restored.list()).map(entry => entry.transcript), ["trzecia", "druga"]);
    await restored.clear();
    assert.deepEqual(await new AssistantHistoryStore(file, 2).list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
