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

test("assistant task runs silently and keeps its result as history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "walldeck-assistant-tasks-"));
  const file = path.join(directory, "schedules.json");
  const fired = [];
  const store = new ScheduleStore(file, { onChanged() {}, onFired: item => fired.push(item) });
  try {
    await store.load();
    const task = await store.createTask({ label: "Telefon do banku", triggerAt: new Date(Date.now() + 700).toISOString(), repeatDays: [], automationPrompt: "Wyślij przypomnienie" });
    await new Promise(resolve => setTimeout(resolve, 1_150));
    assert.equal(fired.length, 1);
    assert.equal(store.list()[0].status, "automation");
    await store.setAutomationResult(task.id, "Przypomnienie wysłane");
    assert.equal(store.list()[0].status, "completed");
    assert.equal(store.list()[0].enabled, false);
    assert.equal(store.list()[0].automationResult, "Przypomnienie wysłane");
  } finally {
    store.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("scheduled assistant task can be edited without changing its identity", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "walldeck-assistant-task-edit-"));
  const file = path.join(directory, "schedules.json");
  const store = new ScheduleStore(file, { onChanged() {}, onFired() {} });
  try {
    await store.load();
    const original = await store.createTask({ label: "Bank", time: "08:00", repeatDays: [1], automationPrompt: "Stara instrukcja" });
    const updated = await store.updateTask(original.id, { label: "Telefon do banku", time: "09:30", repeatDays: [1, 3, 5], automationPrompt: "Wyślij przypomnienie na Telegram" });
    assert.equal(updated.id, original.id);
    assert.equal(updated.createdAt, original.createdAt);
    assert.equal(updated.label, "Telefon do banku");
    assert.equal(updated.time, "09:30");
    assert.deepEqual(updated.repeatDays, [1, 3, 5]);
    assert.equal(updated.automationPrompt, "Wyślij przypomnienie na Telegram");
    assert.equal(JSON.parse(await readFile(file, "utf8"))[0].label, "Telefon do banku");
  } finally {
    store.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("saved alarms can be disabled and enabled without deleting them", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "walldeck-alarm-toggle-"));
  const file = path.join(directory, "schedules.json");
  const store = new ScheduleStore(file, { onChanged() {}, onFired() {} });
  try {
    await store.load();
    const target = new Date(Date.now() + 120_000);
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(target);
    const alarm = await store.createAlarm({ label: "Praca", time, repeatDays: [0, 1, 2, 3, 4, 5, 6], automationPrompt: "" });
    const disabled = await store.setAlarmEnabled(alarm.id, false);
    assert.equal(disabled.enabled, false);
    assert.equal(store.list().length, 1);
    assert.equal(JSON.parse(await readFile(file, "utf8"))[0].enabled, false);
    const enabled = await store.setAlarmEnabled(alarm.id, true);
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.status, "scheduled");
    assert.ok(Date.parse(enabled.triggerAt) > Date.now());
  } finally {
    store.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
