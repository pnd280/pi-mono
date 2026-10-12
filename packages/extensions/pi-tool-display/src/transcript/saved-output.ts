import { AsyncCache } from "@pi-mono/libs/async-cache";

import type { BorrowedToolResult, DisplayCall, SavedOutput } from "../contracts.ts";
import { readSavedOutput } from "../observation/saved-output.ts";
import { record } from "../values.ts";
import type { TranscriptCoordinator } from "./coordinator.ts";

const CACHE_ENTRIES = 8;

/**
 * The saved output of transcript calls. A complete, expanded call with a saved
 * path shows a bounded preview of that file. One session cache shares previews
 * between calls; an evicted preview leaves its calls, which then show retained
 * output. Renderers never initiate reads.
 */
export class SavedOutputs {
  private cache: AsyncCache<string, SavedOutput>;
  private evicted = new WeakSet<SavedOutput>();
  private disposed = false;

  constructor(
    private coordinator: TranscriptCoordinator,
    read: (path: string) => Promise<SavedOutput> = readSavedOutput
  ) {
    this.cache = new AsyncCache({
      capacity: CACHE_ENTRIES,
      maxPending: CACHE_ENTRIES,
      load: read,
      onEvict: (path, output) => {
        // A cache hit can be evicted before its caller's publication microtask runs.
        this.evicted.add(output);
        for (const call of coordinator.calls.values())
          if (call.savedOutput?.path === path) coordinator.setSavedOutput(call, undefined);
      },
      onBusy: (path) => ({
        path,
        notice: "Saved-output loading limit reached; expand again to retry.",
        retryable: true
      })
    });
  }

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
    void this.cache
      .load(path)
      .then((output) => {
        if (this.disposed || !output || call.savedPath !== path || this.evicted.has(output)) return;
        this.coordinator.setSavedOutput(call, output);
      })
      .catch(() => {});
  }

  dispose(): void {
    this.disposed = true;
    this.cache.dispose();
  }
}
