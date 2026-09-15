import { createBoundedPatch } from "@pi-mono/libs/bounded-diff";
import { parsePatch } from "@pi-mono/utils/patch";

import type { ChangeFact } from "./contracts.ts";

export const OBSERVATION_BYTES = 64 * 1024;

export const PATCH_BYTES = 128 * 1024;

const DIFF_EDIT_LIMIT = 2000;
const DIFF_TIMEOUT_MS = 50;

/** Retained tool patches share the same bound in observation, rendering, and history. */
export function parseRetainedPatch(patch: string) {
  return parsePatch(patch, PATCH_BYTES);
}

export function computeChange(
  path: string,
  before: string,
  after: string,
  change: "creation" | "modification"
): ChangeFact {
  const result = createBoundedPatch({
    path,
    before,
    after,
    maxSourceBytes: OBSERVATION_BYTES,
    maxPatchBytes: PATCH_BYTES,
    maxEditLength: DIFF_EDIT_LIMIT,
    timeoutMs: DIFF_TIMEOUT_MS,
    contextLines: 4
  });
  if (result.status === "ready")
    return { kind: "change", availability: "available", change, patch: result.patch };
  const reasons = {
    "source-too-large": "Change exceeds the 64 KiB observation limit.",
    binary: "Binary content.",
    "budget-exceeded": `Diff generation exceeded ${DIFF_TIMEOUT_MS} ms or ${DIFF_EDIT_LIMIT} changed lines.`,
    "patch-too-large": "Patch exceeds the 128 KiB retention limit."
  };

  return { kind: "change", availability: "unavailable", reason: reasons[result.status] };
}
