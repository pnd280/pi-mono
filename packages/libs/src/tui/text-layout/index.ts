import { setImmediate } from "node:timers/promises";

import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Build full-record layout outside render/input paths, yielding on bounded chunks. */
export async function layoutPreview(
  text: string,
  width: number,
  current: () => boolean
): Promise<string[]> {
  const lines: string[] = [];
  let start = 0;
  let steps = 0;

  while (start < text.length) {
    if (steps++ % 32 === 0) {
      await setImmediate();
      if (!current()) return [];
    }

    let end = Math.min(text.length, start + 4096);
    const newline = text.indexOf("\n", start);

    if (newline >= start && newline < end) end = newline;
    // Keep surrogate pairs intact at chunk boundaries.
    if (end < text.length && end > start && /[\uD800-\uDBFF]/u.test(text.charAt(end - 1))) end--;
    lines.push(...wrapTextWithAnsi(text.slice(start, end), Math.max(1, width)));
    start = end + (text[end] === "\n" ? 1 : 0);
  }

  if (!text || text.endsWith("\n")) lines.push("");

  return lines;
}
