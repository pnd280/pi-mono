import { renameSync } from "node:fs";
import { rename } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const ATTEMPTS = 10;
const sleeper = new Int32Array(new SharedArrayBuffer(4));

/**
 * Windows refuses a rename while another process, such as a reader or a virus scanner, has the
 * source or target open. Waits grow by 10 ms per attempt, 450 ms in total.
 */
function retryable(error: unknown, attempt: number): boolean {
  return (
    process.platform === "win32" &&
    attempt < ATTEMPTS &&
    error instanceof Error &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES" || error.code === "EBUSY")
  );
}

/** Rename like `fs.promises.rename`, retrying only transient Windows sharing errors. */
export async function renameWithRetry(source: string, target: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(source, target);
    } catch (error) {
      if (!retryable(error, attempt)) throw error;
      await setTimeout(attempt * 10);
    }
  }
}

/** Rename like `fs.renameSync`, blocking the thread between Windows retries. */
export function renameWithRetrySync(source: string, target: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      return renameSync(source, target);
    } catch (error) {
      if (!retryable(error, attempt)) throw error;
      Atomics.wait(sleeper, 0, 0, attempt * 10);
    }
  }
}
