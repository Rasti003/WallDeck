import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { nextRecurringOccurrence, ScheduleStore } from "../dist/schedules.js";

test("recurring alarms use Warsaw local time across daylight saving time", () => {
  const summer = nextRecurringOccurrence("08:30", [1], new Date("2026-06-28T22:00:00.000Z"));
  const winter = nextRecurringOccurrence("08:30", [1], new Date("2026-12-27T22:00:00.000Z"));
  assert.equal(summer.toISOString(), "2026-06-29T06:30:00.000Z");
  assert.equal(winter.toISOString(), "2026-12-28T07:30:00.000Z");
});

test("schedule store persists timers and fires each due item once", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "walldeck-schedules-"));
  const file = path.join(directory, "schedules.json");
  const fired = [];
  const store = new ScheduleStore(file, { onChanged() {}, onFired: item => fired.push(item) });
  try {
    await store.load();
    const timer = await store.createTimer({ durationSeconds: 1, label: "Herbata", automationPrompt: "Powiedz, że gotowe" });
    assert.equal(store.list()[0].label, "Herbata");
    assert.equal(JSON.parse(await readFile(file, "utf8"))[0].id, timer.id);
    await new Promise(resolve => setTimeout(resolve, 1_350));
    assert.equal(fired.length, 1);
    assert.equal(store.list()[0].status, "ringing");
    await new Promise(resolve => setTimeout(resolve, 650));
    assert.equal(fired.length, 1);
    await store.dismiss(timer.id);
    assert.deepEqual(store.list(), []);
  } finally {
    store.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
