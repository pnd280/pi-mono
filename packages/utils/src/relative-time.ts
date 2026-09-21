// Match Pi's session picker; its formatSessionDate helper is not exported.
const relativeTimeUnits = [
  [365 * 86400, "y"],
  [30 * 86400, "mo"],
  [7 * 86400, "w"],
  [86400, "d"],
  [3600, "h"],
  [60, "m"]
] as const;

/** Compact age with an explicit clock. Nonzero future units have a '+' prefix. */
export function relativeTime(time: number | undefined, now: number): string {
  if (time === undefined) return "Unknown time";
  const seconds = Math.abs(now - time) / 1000;

  for (const [duration, unit] of relativeTimeUnits) {
    if (seconds >= duration)
      return `${time > now ? "+" : ""}${Math.floor(seconds / duration)}${unit}`;
  }

  return "now";
}
