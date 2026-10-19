/**
 * Stop waiting for `operation` when `signal` aborts, and reject with the signal's reason. The
 * operation continues; its later result or rejection is ignored.
 */
export async function raceWithAbortSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  // Observe the operation, so that a rejection after the abort is not unhandled.
  void operation.catch(() => undefined);
  signal.throwIfAborted();

  const { promise, resolve, reject } = Promise.withResolvers<T>();

  const onAbort = (): void => {
    const reason: unknown = signal.reason;
    reject(reason);
  };

  signal.addEventListener("abort", onAbort, { once: true });
  void operation.then(resolve, reject).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });

  return promise;
}
