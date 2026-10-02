import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { AiAssistantConversationEntry, AiAssistantRunResult } from "@walldeck/contracts";

type NewEntry = {
  source: AiAssistantConversationEntry["source"];
  startedAt: string;
  transcript: string;
  result?: AiAssistantRunResult;
  error?: string;
};

export class AssistantHistoryStore {
  private entries: AiAssistantConversationEntry[] | null = null;
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath: string, private readonly limit = 100) {}

  private async load() {
    if (this.entries) return this.entries;
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      this.entries = Array.isArray(value) ? value.slice(-this.limit) : [];
    } catch {
      this.entries = [];
    }
    return this.entries;
  }

  async list() { return [...await this.load()].reverse(); }

  async add(value: NewEntry) {
    const entries = await this.load();
    const entry: AiAssistantConversationEntry = {
      id: randomUUID(),
      source: value.source,
      startedAt: value.startedAt,
      completedAt: new Date().toISOString(),
      transcript: value.transcript,
      ...(value.result ? { result: value.result } : {}),
      ...(value.error ? { error: value.error } : {}),
    };
    entries.push(entry);
    if (entries.length > this.limit) entries.splice(0, entries.length - this.limit);
    await this.persist(entries);
    return entry;
  }

  async clear() {
    const entries = await this.load();
    entries.splice(0);
    await this.persist(entries);
  }

  private persist(entries: AiAssistantConversationEntry[]) {
    const snapshot = JSON.stringify(entries, null, 2) + "\n";
    const temporary = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }
}
