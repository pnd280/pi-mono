import { generateUnifiedPatch } from "@earendil-works/pi-coding-agent";

import type { ChangeFact } from "./display-model.ts";

export const OBSERVATION_BYTES = 64 * 1024;
export const DIFF_LINE_LIMIT = 1000;
export const DIFF_WORK_LIMIT = 40_000;
export interface PatchLine {
  kind: "added" | "removed" | "context" | "separator";
  text: string;
  oldLine?: number;
  newLine?: number;
}
export interface ParsedPatch {
  lines: PatchLine[];
  added: number;
  removed: number;
}
function hunkNumbers(hunk: RegExpExecArray): number[] | undefined {
  const values = [Number(hunk[1]), Number(hunk[3]), Number(hunk[2] ?? 1), Number(hunk[4] ?? 1)];
  return values.every(Number.isSafeInteger) ? values : undefined;
}
function ignorablePatchLine(text: string): boolean {
  return !text || text.startsWith("\\ No newline");
}

/** Interpret native unified patches; never infer changes from the legacy numbered UI diff. */
export function parsePatch(patch: string): ParsedPatch | undefined {
  if (Buffer.byteLength(patch) > 128 * 1024) return undefined;
  const lines: PatchLine[] = [];
  let oldLine = 0,
    newLine = 0,
    oldRemaining = 0,
    newRemaining = 0,
    hunks = 0,
    added = 0,
    removed = 0;
  for (const text of patch.replaceAll("\r\n", "\n").split("\n")) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(text);
    if (hunk) {
      if (Math.max(oldRemaining, newRemaining) > 0) return undefined;
      const numbers = hunkNumbers(hunk);
      if (!numbers) return undefined;
      [oldLine, newLine, oldRemaining, newRemaining] = numbers as [number, number, number, number];
      if (hunks++) lines.push({ kind: "separator", text: "⋮" });
    } else if (hunks && Math.max(oldRemaining, newRemaining) > 0) {
      if (text.startsWith("\\ No newline")) continue;
      if (text.startsWith("+")) {
        lines.push({ kind: "added", text: text.slice(1), newLine: newLine++ });
        newRemaining--;
        added++;
      } else if (text.startsWith("-")) {
        lines.push({ kind: "removed", text: text.slice(1), oldLine: oldLine++ });
        oldRemaining--;
        removed++;
      } else if (text.startsWith(" ")) {
        lines.push({
          kind: "context",
          text: text.slice(1),
          oldLine: oldLine++,
          newLine: newLine++
        });
        oldRemaining--;
        newRemaining--;
      } else return undefined;
      if (oldRemaining < 0 || newRemaining < 0) return undefined;
    } else if (hunks && !ignorablePatchLine(text)) return undefined;
  }
  const emptyPatch = /^--- [^\n]*\n\+\+\+ [^\n]*\n?$/.test(patch);
  return (hunks > 0 || emptyPatch) && Math.max(oldRemaining, newRemaining) === 0
    ? { lines, added, removed }
    : undefined;
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
  const oldLines = before.split("\n").length,
    newLines = after.split("\n").length;
  // The diff helper is synchronous. Bound both input and its quadratic line-search space
  // before invoking it, rather than measuring an already-completed expensive computation.
  if (
    oldLines > DIFF_LINE_LIMIT ||
    newLines > DIFF_LINE_LIMIT ||
    oldLines * newLines > DIFF_WORK_LIMIT
  )
    return unavailable("Change exceeds the diff computation budget.");
  const patch = generateUnifiedPatch(
    path,
    before.replaceAll("\r\n", "\n"),
    after.replaceAll("\r\n", "\n")
  );
  if (Buffer.byteLength(patch) > 128 * 1024)
    return unavailable("Patch exceeds the 128 KiB retention limit.");
  return { kind: "change", availability: "available", change, patch };
}
