import { DiffLineType, DiffParser, type DiffHunk } from "@git-diff-view/core";
import { createPatch, FILE_HEADERS_ONLY } from "diff";

import type { ChangeFact } from "./display-model.ts";

export const OBSERVATION_BYTES = 64 * 1024;
const DIFF_EDIT_LIMIT = 2000;
const DIFF_TIMEOUT_MS = 50;
export interface PatchLine {
  kind: "added" | "removed" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
  noNewline?: true;
}
export interface PatchHunk {
  lines: PatchLine[];
}
export interface ParsedPatch {
  hunks: PatchHunk[];
  added: number;
  removed: number;
}
function validHunk(hunk: DiffHunk): boolean {
  const { oldStartLine, oldLineCount, newStartLine, newLineCount } = hunk.header;
  for (const [start, count] of [
    [oldStartLine, oldLineCount],
    [newStartLine, newLineCount]
  ] as const) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(count) ||
      !Number.isSafeInteger(start + count) ||
      (count > 0 && start === 0)
    )
      return false;
  }
  const content = hunk.lines.slice(1);
  return (
    !hunk.lines[0]?.noTrailingNewLine &&
    content.filter((line) => line.type !== DiffLineType.Add).length === oldLineCount &&
    content.filter((line) => line.type !== DiffLineType.Delete).length === newLineCount
  );
}

/** Parse retained patches only; DiffFile would allocate placeholders up to the largest line number. */
export function parsePatch(patch: string): ParsedPatch | undefined {
  if (Buffer.byteLength(patch) > 128 * 1024) return undefined;
  const normalized = patch.replaceAll("\r\n", "\n").replace(/\n+$/, "");
  if (
    normalized
      .split("\n")
      .some((line) => line.startsWith("\\") && line !== "\\ No newline at end of file")
  )
    return undefined;
  // Native/owner contracts may omit file headers. The parser requires them; these
  // synthetic names are never displayed, persisted, or used to access files.
  const source = (normalized.startsWith("@@ ") ? "--- a\n+++ b\n" : "") + normalized + "\n";
  try {
    const parsed = new DiffParser().parse(source);
    if (
      parsed.isBinary ||
      (!parsed.hunks.length && !/^--- [^\n]*\n\+\+\+ [^\n]*$/.test(normalized))
    )
      return undefined;
    const hunks: PatchHunk[] = [];
    let added = 0,
      removed = 0;
    for (const hunk of parsed.hunks) {
      // Upstream deliberately tolerates mismatched counts; tool results must not.
      if (!validHunk(hunk)) return undefined;
      const lines: PatchLine[] = [];
      for (const line of hunk.lines.slice(1)) {
        const kind =
          line.type === DiffLineType.Add
            ? "added"
            : line.type === DiffLineType.Delete
              ? "removed"
              : "context";
        if (kind === "added") added++;
        if (kind === "removed") removed++;
        lines.push({
          kind,
          text: line.text.replace(/\n$/, ""),
          ...(line.oldLineNumber !== null ? { oldLine: line.oldLineNumber } : {}),
          ...(line.newLineNumber !== null ? { newLine: line.newLineNumber } : {}),
          ...(line.noTrailingNewLine ? { noNewline: true } : {})
        });
      }
      hunks.push({ lines });
    }
    return { hunks, added, removed };
  } catch {
    return undefined;
  }
}
export function computeChange(
  path: string,
  before: string,
  after: string,
  change: "creation" | "modification"
): ChangeFact {
  const unavailable = (reason: string): ChangeFact => ({
    kind: "change",
    availability: "unavailable",
    reason
  });
  if (Buffer.byteLength(before) > OBSERVATION_BYTES || Buffer.byteLength(after) > OBSERVATION_BYTES)
    return unavailable("Change exceeds the 64 KiB observation limit.");
  // Observation rejects invalid UTF-8 while decoding; a literal U+FFFD is valid text.
  if (before.includes("\0") || after.includes("\0")) return unavailable("Binary content.");
  // Let jsdiff bound its search by actual edit distance and elapsed time. Whole-file
  // line products reject tiny changes in otherwise identical files unnecessarily.
  const patch = createPatch(
    path,
    before.replaceAll("\r\n", "\n"),
    after.replaceAll("\r\n", "\n"),
    undefined,
    undefined,
    {
      context: 4,
      headerOptions: FILE_HEADERS_ONLY,
      maxEditLength: DIFF_EDIT_LIMIT,
      timeout: DIFF_TIMEOUT_MS
    }
  );
  if (patch === undefined)
    return unavailable(
      `Diff generation exceeded ${DIFF_TIMEOUT_MS} ms or ${DIFF_EDIT_LIMIT} changed lines.`
    );
  if (Buffer.byteLength(patch) > 128 * 1024)
    return unavailable("Patch exceeds the 128 KiB retention limit.");
  return { kind: "change", availability: "available", change, patch };
}
