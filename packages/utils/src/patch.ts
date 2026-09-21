import { DiffLineType, DiffParser, type DiffHunk } from "@git-diff-view/core";
import { z } from "zod";

const byteLimitSchema = z.int().nonnegative();
const hunkRangeSchema = z
  .object({ start: z.int(), count: z.int(), end: z.int() })
  .refine(({ start, count }) => count <= 0 || start !== 0);

export type PatchLine = {
  kind: "added" | "removed" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
  noNewline?: true;
};

export type PatchHunk = {
  lines: PatchLine[];
};

export type ParsedPatch = {
  hunks: PatchHunk[];
  added: number;
  removed: number;
};

function validHunk(hunk: DiffHunk): boolean {
  const { oldStartLine, oldLineCount, newStartLine, newLineCount } = hunk.header;

  for (const [start, count] of [
    [oldStartLine, oldLineCount],
    [newStartLine, newLineCount]
  ] as const) {
    if (!hunkRangeSchema.safeParse({ start, count, end: start + count }).success) return false;
  }

  const content = hunk.lines.slice(1);

  return (
    !hunk.lines[0]?.noTrailingNewLine &&
    content.some((line) => line.type === DiffLineType.Add || line.type === DiffLineType.Delete) &&
    content.filter((line) => line.type !== DiffLineType.Add).length === oldLineCount &&
    content.filter((line) => line.type !== DiffLineType.Delete).length === newLineCount
  );
}

/**
 * Parse one unified patch, optionally without file headers, within a caller-chosen
 * byte limit. Invalid or oversized patches return undefined; a limit that is not
 * a nonnegative safe integer throws RangeError.
 */
export function parsePatch(patch: string, maxBytes: number): ParsedPatch | undefined {
  if (!byteLimitSchema.safeParse(maxBytes).success)
    throw new RangeError("Patch byte limit must be a nonnegative safe integer.");
  if (Buffer.byteLength(patch) > maxBytes) return undefined;
  const normalized = patch.replaceAll("\r\n", "\n").replace(/\n+$/, "");
  if (
    normalized
      .split("\n")
      .some((line) => line.startsWith("\\") && line !== "\\ No newline at end of file")
  )
    return undefined;
  // Synthetic names satisfy the parser only; they never identify real files.
  const source = (normalized.startsWith("@@ ") ? "--- a\n+++ b\n" : "") + normalized + "\n";

  try {
    // DiffFile allocates placeholders up to the largest line number. Use only the parser.
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
      // Upstream deliberately tolerates mismatched counts; callers must not trust them.
      if (!validHunk(hunk)) return undefined;
      const lines: PatchLine[] = [];

      for (const line of hunk.lines.slice(1)) {
        let kind: PatchLine["kind"] = "context";
        if (line.type === DiffLineType.Add) kind = "added";
        else if (line.type === DiffLineType.Delete) kind = "removed";
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
