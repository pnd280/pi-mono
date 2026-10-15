import { z } from "zod";

const byteLimitSchema = z.int().nonnegative();
const hunkRangeSchema = z
  .object({
    start: z.int().nonnegative(),
    count: z.int().nonnegative(),
    end: z.int().nonnegative()
  })
  .refine(({ start, count }) => count === 0 || start !== 0);

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

type Hunk = PatchHunk & {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
};

/** GNU diff omits a range's count when it is one. Text after the second `@@` is a heading. */
const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Index after the first `+++` line. An empty line before it means the patch has no hunks. */
function headerEnd(lines: readonly string[]): number | undefined {
  for (const [index, line] of lines.entries()) {
    if (!line || (line.startsWith("Binary files ") && line.endsWith("differ"))) return undefined;
    if (line.startsWith("+++")) return index + 1;
  }

  return undefined;
}

/** Split hunks without checking their counts. Any other line between hunks is invalid. */
function readHunks(lines: readonly string[], start: number): Hunk[] | undefined {
  const hunks: Hunk[] = [];
  let index = start;

  while (index < lines.length) {
    const match = hunkHeader.exec(lines[index] ?? "");
    if (!match) return undefined;
    const hunk: Hunk = {
      oldStart: Number(match[1]),
      oldCount: Number(match[2] ?? 1),
      newStart: Number(match[3]),
      newCount: Number(match[4] ?? 1),
      lines: []
    };
    let oldLine = hunk.oldStart,
      newLine = hunk.newStart;

    for (index++; index < lines.length; index++) {
      const line = lines[index] ?? "";
      const text = line.slice(1);

      if (line.startsWith("\\")) {
        // A missing-newline marker must follow a source line, not the hunk header.
        const previous = hunk.lines.at(-1);
        if (!previous) return undefined;
        previous.noNewline = true;
      } else if (line.startsWith("+")) hunk.lines.push({ kind: "added", text, newLine: newLine++ });
      else if (line.startsWith("-")) hunk.lines.push({ kind: "removed", text, oldLine: oldLine++ });
      // An empty line is a context line whose leading space was stripped.
      else if (line === "" || line.startsWith(" "))
        hunk.lines.push({ kind: "context", text, oldLine: oldLine++, newLine: newLine++ });
      else break;
    }

    if (!hunk.lines.length) return undefined;
    hunks.push(hunk);
  }

  return hunks;
}

function validHunk({ oldStart, oldCount, newStart, newCount, lines }: Hunk): boolean {
  for (const [start, count] of [
    [oldStart, oldCount],
    [newStart, newCount]
  ] as const) {
    if (!hunkRangeSchema.safeParse({ start, count, end: start + count }).success) return false;
  }

  return (
    lines.some((line) => line.kind !== "context") &&
    lines.filter((line) => line.kind !== "added").length === oldCount &&
    lines.filter((line) => line.kind !== "removed").length === newCount
  );
}

/** Empty ranges name the line before the insertion/deletion, not its first line. */
function hunkRange(start: number, count: number): { start: number; end: number } {
  const first = count === 0 ? start : start - 1;

  return { start: first, end: first + count };
}

function validHunks(hunks: readonly Hunk[]): boolean {
  let oldEnd = 0,
    newEnd = 0;

  for (const hunk of hunks) {
    // Header counts are untrusted until they match the hunk's lines.
    if (!validHunk(hunk)) return false;
    const oldRange = hunkRange(hunk.oldStart, hunk.oldCount);
    const newRange = hunkRange(hunk.newStart, hunk.newCount);
    if (oldRange.start < oldEnd || newRange.start < newEnd) return false;
    oldEnd = oldRange.end;
    newEnd = newRange.end;
  }

  return true;
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
  const lines = normalized.split("\n");
  if (lines.some((line) => line.startsWith("\\") && line !== "\\ No newline at end of file"))
    return undefined;
  if (/^--- [^\n]*\n\+\+\+ [^\n]*$/.test(normalized)) return { hunks: [], added: 0, removed: 0 };
  const start = normalized.startsWith("@@ ") ? 0 : headerEnd(lines);
  const hunks = start === undefined ? undefined : readHunks(lines, start);
  if (hunks === undefined || hunks.length === 0 || !validHunks(hunks)) return undefined;
  let added = 0,
    removed = 0;

  for (const { lines } of hunks) {
    for (const { kind } of lines) {
      if (kind === "added") added++;
      if (kind === "removed") removed++;
    }
  }

  return { hunks: hunks.map(({ lines }) => ({ lines })), added, removed };
}
