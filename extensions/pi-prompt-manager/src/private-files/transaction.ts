import { atomicReplace, type AtomicWriteWarning, type WriteHooks } from "./atomic.ts";
import type { WriteScope } from "./lifetime.ts";
import { acquireLock } from "./lock.ts";
import { boundedRead } from "./privacy.ts";

export type PrivateFileUpdate<Value> =
  | { status: "unchanged"; value: Value }
  | { status: "replace"; content: string; value: Value };

export type PrivateTransactionResult<Value> = (
  | { status: "committed"; value: Value; warnings: AtomicWriteWarning[] }
  | { status: "unchanged"; value: Value }
  | { status: "failed"; cause: unknown }
) & { cleanupErrors: unknown[] };

export type PrivateTransactionOptions<Value> = {
  /** Establish trusted private parents before returning the data path. */
  path(): Promise<string>;
  scope: WriteScope;
  maxReadBytes: number;
  timeoutMs: number;
  update(raw: Buffer | undefined): PrivateFileUpdate<Value> | Promise<PrivateFileUpdate<Value>>;
  hooks?: WriteHooks;
};

async function transact<Value>(
  options: PrivateTransactionOptions<Value>
): Promise<PrivateTransactionResult<Value>> {
  const { scope } = options;
  const cleanupErrors: unknown[] = [];

  try {
    scope.signal.throwIfAborted();
    const path = await options.path();
    scope.signal.throwIfAborted();
    const lock = await acquireLock(`${path}.lock`, {
      signal: scope.signal,
      timeoutMs: options.timeoutMs
    });
    let released = false;

    const release = async () => {
      if (released) return;
      released = true;

      try {
        await lock.release();
      } catch (error) {
        cleanupErrors.push(error);
      }
    };

    try {
      scope.signal.throwIfAborted();
      const update = await options.update(await boundedRead(path, options.maxReadBytes));
      if (update.status === "unchanged")
        return { status: "unchanged", value: update.value, cleanupErrors };
      scope.signal.throwIfAborted();
      // No await between the final check and entry into the lifetime's atomic phase.
      const warnings = await scope.atomic(async () => {
        try {
          return await atomicReplace(path, update.content, options.hooks);
        } finally {
          // Drain this cleanup with the commit, even when its owner is shutting down.
          await release();
        }
      });

      return { status: "committed", value: update.value, warnings, cleanupErrors };
    } finally {
      await release();
    }
  } catch (cause) {
    return { status: "failed", cause, cleanupErrors };
  }
}

/** Serialize by caller key; cooperating processes also coordinate through the data path's lock. */
export class PrivateFileTransactions {
  private readonly queues = new Map<string, Promise<void>>();

  run<Value>(
    key: string,
    options: PrivateTransactionOptions<Value>
  ): Promise<PrivateTransactionResult<Value>> {
    const result = (this.queues.get(key) ?? Promise.resolve()).then(() => transact(options));
    const tail = result.then(
      () => {},
      () => {}
    );
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });

    return result;
  }
}
