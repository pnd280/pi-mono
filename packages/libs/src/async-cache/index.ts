import { z } from "zod";

const limitsSchema = z.object({ capacity: z.int().positive(), maxPending: z.int().positive() });

export type AsyncCacheOptions<Key, Value> = z.infer<typeof limitsSchema> & {
  load(key: Key): Promise<Value>;
  onEvict?(key: Key, value: Value): void;
  /** Saturation results are returned without caching. The default is undefined. */
  onBusy?(key: Key): Value;
};

/** Bounded LRU storage and same-key in-flight deduplication. Disposal discards late results. */
export class AsyncCache<Key, Value> {
  private readonly cache = new Map<Key, Value>();
  private readonly pending = new Map<Key, Promise<Value | undefined>>();
  private disposed = false;

  constructor(private readonly options: AsyncCacheOptions<Key, Value>) {
    if (!limitsSchema.safeParse(options).success)
      throw new RangeError("Cache limits must be positive safe integers.");
  }

  load(key: Key): Promise<Value | undefined> {
    if (this.disposed) return Promise.resolve(undefined);

    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);

      return Promise.resolve(value);
    }

    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= this.options.maxPending)
      return Promise.resolve(this.options.onBusy?.(key));
    const promise = this.loadValue(key).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);

    return promise;
  }

  private async loadValue(key: Key): Promise<Value | undefined> {
    const value = await this.options.load(key);
    if (this.disposed) return undefined;

    if (this.cache.size >= this.options.capacity) {
      const entry = this.cache.entries().next().value!;
      this.cache.delete(entry[0]);
      this.options.onEvict?.(...entry);
    }

    // An eviction callback may dispose its owner.
    if (this.isDisposed()) return undefined;
    this.cache.set(key, value);

    return value;
  }

  private isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    this.cache.clear();
    this.pending.clear();
  }
}
