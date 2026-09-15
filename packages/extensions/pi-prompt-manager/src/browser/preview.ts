import { wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { yieldWork } from "../search.ts";

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
      await yieldWork();
      if (!current()) return [];
    }

    let end = Math.min(text.length, start + 4096);
    const newline = text.indexOf("\n", start);

    if (newline >= start && newline < end) end = newline;
    // Keep surrogate pairs intact at chunk boundaries.
    if (end < text.length && end > start && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
    lines.push(...wrapTextWithAnsi(text.slice(start, end), Math.max(1, width)));
    start = end + (text[end] === "\n" ? 1 : 0);
  }

  if (!text || text.endsWith("\n")) lines.push("");

  return lines;
}

export function absoluteTime(time: number | undefined): string {
  return time === undefined
    ? "Unknown time"
    : new Date(time).toLocaleString(undefined, { timeZoneName: "longOffset" });
}

// Match Pi's session picker; its formatSessionDate helper is not exported.
const relativeTimeUnits = [
  [365 * 86400, "y"],
  [30 * 86400, "mo"],
  [7 * 86400, "w"],
  [86400, "d"],
  [3600, "h"],
  [60, "m"]
] as const;

export function relativeTime(time: number | undefined, now = Date.now()): string {
  if (time === undefined) return "Unknown time";
  const seconds = Math.abs(now - time) / 1000;

  for (const [duration, unit] of relativeTimeUnits) {
    if (seconds >= duration)
      return `${time > now ? "+" : ""}${Math.floor(seconds / duration)}${unit}`;
  }

  return "now";
}
