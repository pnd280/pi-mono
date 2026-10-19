import type { FileMutation } from "@pi-mono/libs/file-mutations";
import { parsePatch } from "@pi-mono/utils/patch";

import type { ChangeFact, ChangeUnavailableReason } from "./contracts.ts";

export const OBSERVATION_BYTES = 8 * 1024 * 1024;

export const PATCH_BYTES = 128 * 1024;

/** Retained tool patches share the same bound in observation, rendering, and history. */
export function parseRetainedPatch(patch: string) {
  if (patch.length > PATCH_BYTES) return undefined;

  return parsePatch(patch, PATCH_BYTES);
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
 * The patch of a write that created its file, from the content argument as Node
 * writes it: unpaired surrogates become U+FFFD and CRLF compares as LF.
 * Unretainable content returns undefined without building an unbounded patch.
 */
export function creationPatch(content: string): string | undefined {
  // CRLF normalisation can halve the source length. Bound copies before decoding.
  if (content.length > PATCH_BYTES * 2) return undefined;
  const text = Buffer.from(content, "utf8").toString("utf8").replaceAll("\r\n", "\n");
  if (Buffer.byteLength(text) > PATCH_BYTES) return undefined;
  if (!text) return "--- a\n+++ b\n";
  const lines = text.split("\n");
  const terminated = lines.at(-1) === "";
  if (terminated) lines.pop();

  const patch = [
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
    ...(terminated ? [] : ["\\ No newline at end of file"]),
    ""
  ].join("\n");

  return Buffer.byteLength(patch) > PATCH_BYTES ? undefined : patch;
}

const changeReasons: Record<ChangeUnavailableReason, string> = {
  "source-too-large": "Change exceeds the 8 MiB observation budget.",
  "source-unavailable": "Complete UTF-8 source unavailable within the 8 MiB observation budget.",
  binary: "Binary content.",
  "budget-exceeded": "Diff generation exceeded 50 ms or 2000 changed lines.",
  "queue-full": "Diff queue exceeds its 64 MiB memory budget.",
  "worker-failed": "Diff worker failed to start or complete the comparison.",
  "patch-too-large": "Patch exceeds the 128 KiB retention limit."
};

export function isChangeUnavailableReason(value: unknown): value is ChangeUnavailableReason {
  return typeof value === "string" && Object.hasOwn(changeReasons, value);
}

export function changeReasonText(reason: ChangeUnavailableReason): string {
  return changeReasons[reason];
}

export async function mutationChange(mutation: FileMutation): Promise<ChangeFact> {
  const result = await mutation.patch({
    maxSourceBytes: OBSERVATION_BYTES,
    maxPatchBytes: PATCH_BYTES,
    maxEditLength: 2000,
    timeoutMs: 50,
    contextLines: 4
  });
  if (result.status === "ready")
    return {
      kind: "change",
      change: mutation.before.status === "missing" ? "creation" : "modification",
      patch: result.patch
    };

  return { kind: "change", change: "unavailable", reason: result.status };
}
