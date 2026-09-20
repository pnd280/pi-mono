import { performance } from "node:perf_hooks";
import { clearTimeout, setTimeout } from "node:timers";
import { Worker } from "node:worker_threads";

import type { BoundedPatchOptions, BoundedPatchResult } from "./index.ts";

export type WorkerResponse = BoundedPatchResult | { status: "online" };

const MAX_REQUESTS = 4;
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
const STARTUP_MS = 1000;
const IDLE_MS = 30000;

/** Serializes bounded work across consumers, including independently loaded extensions. */
class PatchProcessor {
  private worker: Worker | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private retainedBytes = 0;

  run(options: BoundedPatchOptions): Promise<BoundedPatchResult> {
    const bytes = 2 * (options.before.length + options.after.length + options.path.length);
    if (
      options.timeoutMs === 0 ||
      this.pending >= MAX_REQUESTS ||
      this.retainedBytes + bytes > MAX_RETAINED_BYTES
    )
      return Promise.resolve({ status: "budget-exceeded" });
    this.pending++;
    this.retainedBytes += bytes;
    const result = this.queue.then(() => this.execute(options));
    this.queue = result.then(() => {
      this.pending--;
      this.retainedBytes -= bytes;
    });

    return result;
  }

  private async stop(worker: Worker): Promise<void> {
    if (this.worker === worker) {
      this.worker = undefined;
      clearTimeout(this.idle);
    }

    await worker.terminate().catch(() => {});
  }

  private receive(
    worker: Worker,
    timeoutMs: number,
    options?: BoundedPatchOptions
  ): Promise<WorkerResponse | undefined> {
    return new Promise((resolve) => {
      const deadline = performance.now() + timeoutMs;
      const timer = setTimeout(() => finish(), Math.min(timeoutMs, 2_147_483_647));

      const finish = (response?: WorkerResponse) => {
        clearTimeout(timer);
        worker.off("message", received);
        worker.off("error", failed);
        worker.off("exit", failed);
        resolve(response);
      };

      const failed = () => finish();
      // Private worker protocol. Check the parent deadline even if a late message beats the timer.
      const received = (response: WorkerResponse) =>
        finish(performance.now() <= deadline ? response : undefined);
      worker.once("message", received);
      worker.once("error", failed);
      worker.once("exit", failed);

      try {
        if (options) worker.postMessage(options);
      } catch {
        finish();
      }
    });
  }

  private async execute(options: BoundedPatchOptions): Promise<BoundedPatchResult> {
    clearTimeout(this.idle);
    let worker = this.worker;

    try {
      if (!worker) {
        worker = new Worker(new URL("./worker.ts", import.meta.url), {
          execArgv: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"],
          resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 }
        });
        const current = worker;
        this.worker = worker;
        worker.on("error", () => {});
        worker.once("exit", () => {
          if (this.worker === current) this.worker = undefined;
        });

        // Module loading has a separate bounded allowance; no source is sent before readiness.
        if ((await this.receive(worker, STARTUP_MS))?.status !== "online") {
          await this.stop(worker);

          return { status: "budget-exceeded" };
        }
      }

      worker.ref();
      const result = await this.receive(worker, options.timeoutMs, options);

      if (!result || result.status === "online") {
        await this.stop(worker);

        return { status: "budget-exceeded" };
      }

      const current = worker;
      worker.unref();
      this.idle = setTimeout(() => {
        void this.stop(current);
      }, IDLE_MS).unref();

      return result;
    } catch {
      if (worker) await this.stop(worker);

      return { status: "budget-exceeded" };
    }
  }
}

const processorKey = Symbol.for("pi-mono.bounded-diff");
const shared: typeof globalThis & { [processorKey]?: PatchProcessor } = globalThis;

export function processPatch(options: BoundedPatchOptions): Promise<BoundedPatchResult> {
  let processor = shared[processorKey];

  if (!processor) {
    processor = new PatchProcessor();
    shared[processorKey] = processor;
  }

  return processor.run(options);
}
