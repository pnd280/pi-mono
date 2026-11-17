import { parsePatch } from "@pi-mono/utils/patch";
import { createPatch, OMIT_HEADERS } from "diff";

import { PATCH_QUEUE_BYTES, type PatchLimits } from "./bounded-diff/index.ts";
import type { ChangeFact, ChangeUnavailableReason } from "./contracts.ts";
import type { FileMutation } from "./file-mutations/index.ts";

export const OBSERVATION_BYTES = 8 * 1024 * 1024;

export const PATCH_BYTES = 128 * 1024;

const PATCH_LIMITS = {
  maxSourceBytes: OBSERVATION_BYTES,
  maxPatchBytes: PATCH_BYTES,
  maxEditLength: 2000,
  timeoutMs: 50,
  contextLines: 4
} satisfies PatchLimits;

const OBSERVATION_MIB = PATCH_LIMITS.maxSourceBytes / 1024 / 1024;

/** Retained tool patches share the same bound in observation, rendering, and history. */
export function parseRetainedPatch(patch: string) {
  return parsePatch(patch, PATCH_BYTES);
}

/**
 * Lines that a successful call added and removed: from the patch its result published, else from the observed change.
 */
export function changedLines(
  published: unknown,
  change: ChangeFact | undefined
): { added: number; removed: number } | undefined {
  for (const patch of [published, change?.patch]) {
    const parsed = typeof patch === "string" ? parseRetainedPatch(patch) : undefined;
    if (parsed) return { added: parsed.added, removed: parsed.removed };
  }

  return undefined;
}

/** Compare the parsed hunks of two patches. Line endings, file headers, and a leading BOM are ignored. */
export function sameRetainedHunks(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined || right === undefined) return false;

  const comparable = (patch: string) => {
    const parsed = parseRetainedPatch(patch);

    return (
      parsed &&
      JSON.stringify(
        parsed.hunks.map((hunk) =>
          hunk.lines.map((line) =>
            line.oldLine === 1 || line.newLine === 1
              ? { ...line, text: line.text.replace(/^\uFEFF/, "") }
              : line
          )
        )
      )
    );
  };

  const parsed = comparable(left);

  return parsed !== undefined && parsed === comparable(right);
}

/**
 * The patch of a write that created its file, from the content argument as Node writes it: unpaired surrogates become U+FFFD and CRLF compares as LF. Unretainable content returns undefined without building an unbounded patch.
 */
export function creationPatch(content: string): string | undefined {
  // CRLF normalisation can halve the source length. Bound copies before decoding.
  if (content.length > PATCH_BYTES * 2) return undefined;
  const text = Buffer.from(content, "utf8").toString("utf8").replaceAll("\r\n", "\n");
  if (Buffer.byteLength(text) > PATCH_BYTES) return undefined;
  // A hunk-only patch of empty content would be empty, which is no valid patch.
  if (!text) return "--- a\n+++ b\n";
  const patch = createPatch("", "", text, undefined, undefined, { headerOptions: OMIT_HEADERS });

  return Buffer.byteLength(patch) > PATCH_BYTES ? undefined : patch;
}

const changeReasons: Record<ChangeUnavailableReason, string> = {
  "source-too-large": `Change exceeds the ${OBSERVATION_MIB} MiB observation budget.`,
  "source-unavailable": `Complete UTF-8 source unavailable within the ${OBSERVATION_MIB} MiB observation budget.`,
  binary: "Binary content.",
  "budget-exceeded": `Diff generation exceeded ${PATCH_LIMITS.timeoutMs} ms or ${PATCH_LIMITS.maxEditLength} changed lines.`,
  "queue-full": `Diff queue exceeds its ${PATCH_QUEUE_BYTES / 1024 / 1024} MiB memory budget.`,
  "worker-failed": "Diff worker failed to start or complete the comparison.",
  "patch-too-large": `Patch exceeds the ${PATCH_LIMITS.maxPatchBytes / 1024} KiB retention limit.`
};

export function isChangeUnavailableReason(value: unknown): value is ChangeUnavailableReason {
  return typeof value === "string" && Object.hasOwn(changeReasons, value);
}

export function changeReasonText(reason: ChangeUnavailableReason): string {
  return changeReasons[reason];
}

export async function mutationChange(mutation: FileMutation): Promise<ChangeFact> {
  const result = await mutation.patch(PATCH_LIMITS);
  const change = mutation.before.status === "missing" ? "creation" : "modification";

  return result.status === "ready"
    ? { kind: "change", change, patch: result.patch }
    : { kind: "change", change, unavailable: result.status };
}
