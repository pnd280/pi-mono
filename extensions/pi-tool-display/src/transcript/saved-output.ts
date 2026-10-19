import type { BorrowedToolResult, DisplayCall, SavedOutput } from "../contracts.ts";
import type * as SavedOutputReader from "../observation/saved-output.ts";
import { record } from "../values.ts";
import type { TranscriptCoordinator } from "./coordinator.ts";

/** Cached previews, and also concurrent reads of distinct paths. */
const CACHE_ENTRIES = 8;

// Only expanding a completed call reads saved output, so load the reader then.
let reader: Promise<typeof SavedOutputReader> | undefined;
const loadReader = () => (reader ??= import("../observation/saved-output.ts"));
const readSavedOutput = async (path: string) => (await loadReader()).readSavedOutput(path);

/**
 * The saved output of transcript calls. A complete, expanded call with a saved
 * path shows a bounded preview of that file. One session LRU cache shares previews
 * and in-flight reads between calls; an evicted preview leaves its calls, which
 * then show retained output. Renderers never initiate reads.
 */
export class SavedOutputs {
  private cache = new Map<string, SavedOutput>();
  private pending = new Map<string, Promise<SavedOutput | undefined>>();
  private evicted = new WeakSet<SavedOutput>();
  private disposed = false;

  constructor(
    private coordinator: TranscriptCoordinator,
    private read: (path: string) => Promise<SavedOutput> = readSavedOutput
  ) {}

  /** Keep the saved path from Pi's result details when the call's adapter shows saved output. */
  retain(call: DisplayCall, result: BorrowedToolResult): void {
    if (!call.adapter.savedOutput) return;
    const path = record(result.details).fullOutputPath;
    if (typeof path === "string") this.coordinator.setSavedPath(call, path);
  }

  /** The coordinator's hook: the call's saved path, expansion, or completion changed. */
  refresh(call: DisplayCall): void {
    const path = call.savedPath;
    if (
      this.disposed ||
      !path ||
      !call.expanded ||
      call.lifecycle !== "complete" ||
      (call.savedOutput?.path === path && !call.savedOutput.retryable)
    )
      return;
    this.coordinator.setSavedOutput(call, undefined);
    void this.load(path)
      .then((output) => {
        if (this.disposed || !output || call.savedPath !== path || this.evicted.has(output)) return;
        this.coordinator.setSavedOutput(call, output);
      })
      .catch(() => {});
  }

  private load(path: string): Promise<SavedOutput | undefined> {
    const cached = this.cache.get(path);

    if (cached) {
      this.cache.delete(path);
      this.cache.set(path, cached);

      return Promise.resolve(cached);
    }

    const pending = this.pending.get(path);
    if (pending) return pending;
    // Saturation results are returned without caching.
    if (this.pending.size >= CACHE_ENTRIES)
      return Promise.resolve({
        path,
        notice: "Saved-output loading limit reached; expand again to retry.",
        retryable: true
      });
    const promise = this.loadOutput(path).finally(() => this.pending.delete(path));
    this.pending.set(path, promise);

    return promise;
  }

  /** Failed reads are not cached. Disposal discards late results. */
  private async loadOutput(path: string): Promise<SavedOutput | undefined> {
    const output = await this.read(path);
    // Disposal clears the cache, so a disposed owner evicts nothing.
    if (this.cache.size >= CACHE_ENTRIES) this.evictOldest();
    // Eviction may dispose the owner.
    if (this.disposed) return undefined;
    this.cache.set(path, output);

    return output;
  }

  private evictOldest(): void {
    const oldest = this.cache.entries().next();
    if (oldest.done) return;
    const [path, output] = oldest.value;
    this.cache.delete(path);
    // A cache hit can be evicted before its caller's publication microtask runs.
    this.evicted.add(output);
    for (const call of this.coordinator.calls.values())
      if (call.savedOutput?.path === path) this.coordinator.setSavedOutput(call, undefined);
  }

  dispose(): void {
    this.disposed = true;
    this.cache.clear();
    this.pending.clear();
  }
}
