import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { DiagnosticEntry, DiagnosticEntryInput } from "@walldeck/contracts";

export class DiagnosticStore {
  private entries: DiagnosticEntry[] | null = null;
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath: string, private readonly limit = 1_000) {}

  private async load() {
    if (this.entries) return this.entries;
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      this.entries = Array.isArray(value) ? value.slice(-this.limit) : [];
    } catch { this.entries = []; }
    return this.entries;
  }

  async list(scope: "all" | "errors" | "activity" = "all", limit = 250) {
    const entries = await this.load();
    const filtered = scope === "all" ? entries : entries.filter(entry => scope === "errors" ? entry.level === "error" : entry.category === "tablet");
    return filtered.slice(-Math.max(1, Math.min(limit, 1_000))).reverse();
  }

  async add(value: DiagnosticEntryInput) {
    const entries = await this.load();
    const entry: DiagnosticEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: value.level,
      category: value.category,
      title: value.title.trim().slice(0, 140),
      message: value.message.trim().slice(0, 2_000),
      ...(value.details?.trim() ? { details: value.details.trim().slice(0, 6_000) } : {}),
      ...(value.deviceId ? { deviceId: value.deviceId.slice(0, 128) } : {}),
    };
    entries.push(entry);
    if (entries.length > this.limit) entries.splice(0, entries.length - this.limit);
    await this.persist(entries);
    return entry;
  }

  async clear(scope: "all" | "errors" | "activity") {
    const entries = await this.load();
    if (scope === "all") entries.splice(0);
    else {
      const keep = entries.filter(entry => scope === "errors" ? entry.level !== "error" : entry.category !== "tablet");
      entries.splice(0, entries.length, ...keep);
    }
    await this.persist(entries);
  }

  private persist(entries: DiagnosticEntry[]) {
    const snapshot = `${JSON.stringify(entries, null, 2)}\n`;
    const temporary = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }
}
