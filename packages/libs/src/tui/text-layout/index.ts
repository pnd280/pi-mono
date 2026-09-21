import { setImmediate } from "node:timers/promises";

import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

const SCAN_SIZE = 4096;

/** Build full-record layout outside render/input paths, yielding between scan batches. */
export async function layoutPreview(
  text: string,
  width: number,
  current: () => boolean
): Promise<string[]> {
  const lines: string[] = [];
  const wrapWidth = Math.max(1, width);
  let prefix = "";
  let start = 0;
  let offset = 0;
  let steps = 0;

  do {
    if (steps++ % 32 === 0) {
      await setImmediate();
      if (!current()) return [];
    }

    const scanEnd = Math.min(text.length, offset + SCAN_SIZE);
    const chunk = text.slice(offset, scanEnd);
    const newline = Math.max(chunk.lastIndexOf("\n"), chunk.lastIndexOf("\r"));
    let end = newline < 0 ? -1 : offset + newline + 1;
    if (scanEnd === text.length) end = scanEnd;
    // Pi treats CRLF as one delimiter, including when it straddles a scan boundary.
    if (end > 0 && text[end - 1] === "\r" && text[end] === "\n") end++;
    offset = Math.max(scanEnd, end);
    if (end < 0) continue;

    // Only complete logical lines are independently wrappable. Pi's fast path
    // preserves whitespace on lines that fit, and its wrapped rows are not
    // resumable source fragments. A single long logical line stays atomic.
    const wrapped = wrapTextWithAnsi(prefix + text.slice(start, end), wrapWidth);
    // A nonfinal batch ends in a real newline. Its final empty logical line
    // contains precisely Pi's active ANSI prefix for the following batch.
    if (end < text.length) prefix = wrapped.pop() ?? "";
    for (const line of wrapped) lines.push(line);
    start = end;
  } while (offset < text.length);

  return lines;
}
