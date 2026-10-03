// Tool I/O must never block iteration of Live's audio stream. A continuation
// waits for BOTH response.completed and every function output in that response.
export class LiveToolQueue {
  private rounds = new Map<string, { pending: number; completed: boolean; tools: boolean }>();
  private seen = new Set<string>();
  private stopped = false;
  private chain: Promise<void> = Promise.resolve();
  constructor(private readonly next: () => void, private readonly done: (id: string) => void,
    private readonly error: (error: unknown) => void) {}

  enqueue(id: string, callId: string, run: () => Promise<void>) {
    if (this.stopped || this.seen.has(callId)) return;
    this.seen.add(callId);
    const round = this.rounds.get(id) ?? { pending: 0, completed: false, tools: false };
    this.rounds.set(id, round);
    round.pending++;
    round.tools = true;
    this.chain = this.chain.then(async () => {
      try { if (!this.stopped) await run(); } catch (error) { this.error(error); }
      finally { round.pending--; this.flush(id, round); }
    });
  }
  completed(id: string) {
    const round = this.rounds.get(id) ?? { pending: 0, completed: false, tools: false };
    this.rounds.set(id, round);
    round.completed = true;
    this.flush(id, round);
  }
  private flush(id: string, round: { pending: number; completed: boolean; tools: boolean }) {
    if (this.stopped || round.pending || !round.completed) return;
    this.rounds.delete(id);
    if (round.tools) this.next(); else this.done(id);
  }
  stop() { this.stopped = true; }
}
