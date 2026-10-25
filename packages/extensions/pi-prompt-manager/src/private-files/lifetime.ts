export type WriteScope = {
  signal: AbortSignal;
  /** Check expiry synchronously, then track the complete commit and its cleanup. */
  atomic<Value>(write: () => Promise<Value>): Promise<Value>;
};

/** Abort unstarted work on disposal, but drain atomic writes that already began. */
export class WriteLifetime implements WriteScope {
  private readonly lifetime = new AbortController();
  private readonly writes = new Set<Promise<unknown>>();

  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  atomic<Value>(write: () => Promise<Value>): Promise<Value> {
    this.signal.throwIfAborted();
    const promise = write();
    this.writes.add(promise);
    void promise.finally(() => this.writes.delete(promise)).catch(() => {});

    return promise;
  }

  async dispose(): Promise<void> {
    this.lifetime.abort();
    await Promise.allSettled(this.writes);
  }
}
