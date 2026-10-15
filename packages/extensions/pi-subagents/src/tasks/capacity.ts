type Slot = () => void;

type Waiter = {
  resolve: (release: Slot) => void;
  reject: (error: Error) => void;
  dispose: () => void;
};

/** Reservations count before spawn, and stay held until the process exits. */
export class Capacity {
  private used = 0;
  private queue: Waiter[] = [];
  private closed = false;

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number
  ) {}

  acquire(signal?: AbortSignal): Promise<Slot> {
    if (this.closed) return Promise.reject(new Error("Subagent session ended"));
    if (signal?.aborted) return Promise.reject(new Error("Cancelled by turn abort"));
    if (this.used < this.maxConcurrent) return Promise.resolve(this.reserve());
    if (this.queue.length >= this.maxQueued)
      return Promise.reject(
        new Error(
          `launch queue is full (${this.maxQueued} subagents waiting); do the work yourself`
        )
      );

    return new Promise((resolve, reject) => {
      const abort = () => {
        this.queue = this.queue.filter((entry) => entry !== waiter);
        waiter.dispose();
        reject(new Error("Cancelled by turn abort"));
      };

      const waiter: Waiter = {
        resolve,
        reject,
        dispose: () => signal?.removeEventListener("abort", abort)
      };
      this.queue.push(waiter);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  shutdown(): void {
    this.closed = true;
    const waiting = this.queue;
    this.queue = [];

    for (const waiter of waiting) {
      waiter.dispose();
      waiter.reject(new Error("Subagent session ended"));
    }
  }

  /** Nested launches never join a queue behind their own ancestors. */
  tryAcquire(): Slot | undefined {
    return !this.closed && this.used < this.maxConcurrent ? this.reserve() : undefined;
  }

  private reserve(): Slot {
    this.used++;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.used--;
      const next = this.queue.shift();
      if (!next) return;
      next.dispose();
      next.resolve(this.reserve());
    };
  }
}
