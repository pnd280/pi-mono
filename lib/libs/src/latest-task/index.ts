export type LatestTaskOptions = { changed(): void };

/** A replaceable async query. Only the current task may commit or clear its pending state. */
export class LatestTask {
  private generation = 0;
  private disposed = false;
  private running = false;

  constructor(private readonly options: LatestTaskOptions) {}

  get pending(): boolean {
    return this.running;
  }

  async run<Value>(
    work: (current: () => boolean) => Promise<Value>,
    commit: (value: Value) => void
  ): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    const current = () => !this.disposed && generation === this.generation;
    this.running = true;
    this.options.changed();

    try {
      const value = await work(current);
      if (current()) commit(value);
    } catch (error) {
      if (current()) throw error;
    } finally {
      if (current()) {
        this.running = false;
        this.options.changed();
      }
    }
  }

  cancel(): void {
    this.generation++;
    const wasRunning = this.running;
    this.running = false;
    if (wasRunning && !this.disposed) this.options.changed();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
