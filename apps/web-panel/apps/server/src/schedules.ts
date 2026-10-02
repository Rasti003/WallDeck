import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { alarmInputSchema, timerInputSchema, type AlarmInput, type ScheduledItem, type TimerInput } from "@walldeck/contracts";

const zone = "Europe/Warsaw";
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const weekday = new Map([["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6]]);

export function nextRecurringOccurrence(time: string, repeatDays: number[], after = new Date()) {
  const start = new Date(Math.ceil((after.getTime() + 1) / 60_000) * 60_000);
  for (let offset = 0; offset <= 8 * 24 * 60; offset++) {
    const candidate = new Date(start.getTime() + offset * 60_000);
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]));
    if (`${parts.hour}:${parts.minute}` === time && repeatDays.includes(weekday.get(parts.weekday) ?? -1)) return candidate;
  }
  throw new Error("Nie udało się wyznaczyć kolejnego terminu alarmu");
}

type ScheduleCallbacks = {
  onChanged(items: ScheduledItem[]): void;
  onFired(item: ScheduledItem): void | Promise<void>;
};

export class ScheduleStore {
  private items: ScheduledItem[] = [];
  private timer: NodeJS.Timeout | null = null;
  private saving = Promise.resolve();

  constructor(private readonly filePath: string, private readonly callbacks: ScheduleCallbacks) {}

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as ScheduledItem[];
      this.items = Array.isArray(raw) ? raw.filter(item => item?.id && ["timer", "alarm"].includes(item.kind)) : [];
    } catch { this.items = []; }
    this.start();
    return this.list();
  }

  list() { return structuredClone(this.items).sort((a, b) => Date.parse(a.triggerAt) - Date.parse(b.triggerAt)); }

  async createTimer(raw: TimerInput) {
    const input = timerInputSchema.parse(raw);
    const now = new Date();
    const item: ScheduledItem = {
      id: randomUUID(), kind: "timer", label: input.label || "Minutnik", automationPrompt: input.automationPrompt,
      createdAt: now.toISOString(), triggerAt: new Date(now.getTime() + input.durationSeconds * 1000).toISOString(),
      durationSeconds: input.durationSeconds, repeatDays: [], enabled: true, status: "scheduled",
    };
    this.items.push(item); await this.commit(); return structuredClone(item);
  }

  async createAlarm(raw: AlarmInput) {
    const input = alarmInputSchema.parse(raw);
    const now = new Date();
    const trigger = input.triggerAt ? new Date(input.triggerAt) : nextRecurringOccurrence(input.time!, input.repeatDays, now);
    if (!Number.isFinite(trigger.getTime()) || trigger.getTime() <= now.getTime()) throw new Error("Termin alarmu musi być w przyszłości");
    const item: ScheduledItem = {
      id: randomUUID(), kind: "alarm", label: input.label || "Budzik", automationPrompt: input.automationPrompt,
      createdAt: now.toISOString(), triggerAt: trigger.toISOString(), time: input.time, repeatDays: input.repeatDays,
      enabled: true, status: "scheduled",
    };
    this.items.push(item); await this.commit(); return structuredClone(item);
  }

  async remove(id: string) {
    const before = this.items.length;
    this.items = this.items.filter(item => item.id !== id);
    if (before === this.items.length) throw new Error("Nie znaleziono minutnika ani budzika");
    await this.commit(); return { ok: true as const, id };
  }

  async dismiss(id: string) {
    const item = this.require(id);
    if (item.repeatDays.length && item.time) {
      item.triggerAt = nextRecurringOccurrence(item.time, item.repeatDays, new Date(Date.now() + 30_000)).toISOString();
      item.status = "scheduled"; item.automationResult = undefined;
    } else this.items = this.items.filter(candidate => candidate.id !== id);
    await this.commit(); return { ok: true as const, id };
  }

  async snooze(id: string, minutes: number) {
    const item = this.require(id);
    item.triggerAt = new Date(Date.now() + minutes * 60_000).toISOString();
    item.status = "scheduled"; item.enabled = true; item.automationResult = undefined;
    await this.commit(); return structuredClone(item);
  }

  async setAutomationResult(id: string, result: string) {
    const item = this.items.find(candidate => candidate.id === id);
    if (!item) return;
    item.automationResult = result.slice(0, 500);
    await this.commit();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 500);
    void this.tick();
  }

  private async tick() {
    const due = this.items.filter(item => item.enabled && item.status === "scheduled" && Date.parse(item.triggerAt) <= Date.now());
    for (const item of due) {
      item.status = "ringing"; item.lastTriggeredAt = new Date().toISOString();
      await this.commit();
      void Promise.resolve(this.callbacks.onFired(structuredClone(item)));
    }
  }

  private require(id: string) {
    const item = this.items.find(candidate => candidate.id === id);
    if (!item) throw new Error("Nie znaleziono minutnika ani budzika");
    return item;
  }

  private async commit() {
    const snapshot = `${JSON.stringify(this.items, null, 2)}\n`;
    this.saving = this.saving.then(async () => {
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    await this.saving;
    this.callbacks.onChanged(this.list());
  }
}
