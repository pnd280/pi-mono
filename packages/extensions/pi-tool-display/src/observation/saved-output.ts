import { readBoundedOutput } from "@pi-mono/libs/bounded-output";
import { outputOmission } from "@pi-mono/utils/output-text";

import type { SavedOutput } from "../contracts.ts";

const SAVED_OUTPUT_BYTES = 256 * 1024;

const SAVED_OUTPUT_LINES = 4000;

/** A bounded head/tail preview of a saved-output file, or a notice that keeps retained output. */
export async function readSavedOutput(path: string): Promise<SavedOutput> {
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
