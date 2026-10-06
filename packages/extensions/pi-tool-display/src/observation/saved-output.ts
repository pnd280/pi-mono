import { AsyncCache } from "@pi-mono/libs/async-cache";
import { readBoundedOutput } from "@pi-mono/libs/bounded-output";
import { outputOmission } from "@pi-mono/utils/output-text";

import type { SavedOutput } from "../contracts.ts";

export const SAVED_OUTPUT_BYTES = 256 * 1024;

export const SAVED_OUTPUT_LINES = 4000;

export const SAVED_OUTPUT_CACHE_ENTRIES = 8;

export async function readOutput(path: string): Promise<SavedOutput> {
  const result = await readBoundedOutput(path, {
    maxBytes: SAVED_OUTPUT_BYTES,
    maxLines: SAVED_OUTPUT_LINES,
    formatOmission: ({ count, unit }) =>
      outputOmission(`… ${count} ${unit === "retained-lines" ? "retained lines" : unit} omitted …`)
  });
  if (result.status === "ready")
    return {
      path,
      ...result.output,
      notice: result.truncated
        ? "Saved output is a bounded head/tail preview, not complete output."
        : undefined
    };
  const notices = {
    "not-file": "Saved output unavailable: not a regular file; showing retained output.",
    changed: "Saved output incomplete or changing; showing retained output.",
    unavailable: "Saved output unavailable; showing retained output."
  };

  return { path, notice: notices[result.status] };
}

/** Session-scoped preview policy. Renderers never initiate reads. */
export class SavedOutputLoader extends AsyncCache<string, SavedOutput> {
  private evicted = new WeakSet<SavedOutput>();

  constructor(
    loadFile: (path: string) => Promise<SavedOutput> = readOutput,
    onEvict: (path: string) => void = () => {}
  ) {
    super({
      capacity: SAVED_OUTPUT_CACHE_ENTRIES,
      maxPending: SAVED_OUTPUT_CACHE_ENTRIES,
      load: loadFile,
      onEvict: (path, output) => {
        this.evicted.add(output);
        onEvict(path);
      },
      onBusy: (path) => ({
        path,
        notice: "Saved-output loading limit reached; expand again to retry.",
        retryable: true
      })
    });
  }

  /** A cache hit may be evicted before its caller's publication microtask runs. */
  wasEvicted(output: SavedOutput): boolean {
    return this.evicted.has(output);
  }
}
