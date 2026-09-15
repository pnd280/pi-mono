import { Worker } from "node:worker_threads";

import { PromptError, type Collection, type Snapshot } from "../model.ts";
import { readCollection, updateCollection } from "./collection.ts";

type ReadOptions = {
  collection: Collection;
  cwd: string;
  raw: Buffer | undefined;
  signal?: AbortSignal;
};

type UpdateOptions = Parameters<typeof updateCollection>[0] & { signal?: AbortSignal };

type ReadInput = Omit<ReadOptions, "raw" | "signal"> & { raw: Uint8Array | undefined };

type UpdateInput = Omit<UpdateOptions, "raw" | "signal"> & { raw: Uint8Array | undefined };

export type CollectionRequest =
  | { kind: "read"; options: ReadInput }
  | { kind: "update"; options: UpdateInput };

export type CollectionResponse =
  | { status: "success"; value: Snapshot | ReturnType<typeof updateCollection> }
  | { status: "error"; message: string };

const workerThreshold = 1024 * 1024;

/** One lazy, serialized worker; idle threads neither keep Pi alive nor retain a session. */
class CollectionWorker {
  private worker: Worker | undefined;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private queue: Promise<void> = Promise.resolve();

  run(request: CollectionRequest, signal?: AbortSignal) {
    const result = this.queue.then(() => this.execute(request, signal));
    this.queue = result.then(
      () => {},
      () => {}
    );

    return result;
  }

  private stop(worker: Worker) {
    if (this.worker === worker) this.worker = undefined;
    void worker.terminate();
  }

  private execute(
    request: CollectionRequest,
    signal?: AbortSignal
  ): Promise<Snapshot | ReturnType<typeof updateCollection>> {
    signal?.throwIfAborted();
    clearTimeout(this.idle);
    const worker = (this.worker ??= new Worker(new URL("./collection-worker.ts", import.meta.url), {
      execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"]
    })
      .on("error", () => {
        this.stop(worker);
      })
      .on("exit", () => {
        if (this.worker === worker) this.worker = undefined;
      }));
    worker.ref();

    return new Promise((resolve, reject) => {
      const finish = (error: unknown, value?: Snapshot | ReturnType<typeof updateCollection>) => {
        signal?.removeEventListener("abort", aborted);
        worker.off("message", received);
        worker.off("error", failed);
        worker.off("exit", exited);
        worker.unref();
        if (this.worker === worker) this.idle = setTimeout(() => this.stop(worker), 30000).unref();
        if (value !== undefined) resolve(value);
        else reject(error);
      };

      const aborted = () => {
        this.stop(worker);
        finish(signal?.reason);
      };

      const failed = (error: Error) => finish(error);
      const exited = () =>
        finish(new PromptError("Collection processing stopped before completion."));

      // This protocol is private to our worker, not input supplied by stored documents.
      const received = (response: CollectionResponse) => {
        if (response.status === "success") finish(undefined, response.value);
        else finish(new PromptError(response.message));
      };

      signal?.addEventListener("abort", aborted, { once: true });
      worker.once("message", received);
      worker.once("error", failed);
      worker.once("exit", exited);

      try {
        // Never transfer a borrowed Buffer's backing store (which may also be pooled).
        const raw =
          request.options.raw === undefined ? undefined : Uint8Array.from(request.options.raw);
        worker.postMessage(
          { ...request, options: { ...request.options, raw } },
          raw ? [raw.buffer] : []
        );
      } catch (error) {
        finish(error);
      }
    });
  }
}

const processor = new CollectionWorker();

export async function readCollectionAsync({ signal, ...options }: ReadOptions): Promise<Snapshot> {
  signal?.throwIfAborted();
  if ((options.raw?.length ?? 0) < workerThreshold)
    return readCollection(options.collection, options.cwd, options.raw);
  const result = await processor.run({ kind: "read", options }, signal);
  if (result.status !== "ready") throw new PromptError("Unexpected collection processing result.");

  return result;
}

export async function updateCollectionAsync({
  signal,
  ...options
}: UpdateOptions): Promise<ReturnType<typeof updateCollection>> {
  signal?.throwIfAborted();
  if ((options.raw?.length ?? 0) < workerThreshold) return updateCollection(options);
  const result = await processor.run({ kind: "update", options }, signal);
  if (result.status === "ready") throw new PromptError("Unexpected collection processing result.");

  return result;
}
