/** Formats a token count on the same scale as Pi's footer: `999`, `1.2k`, `12k`, `1.2M`, `12M`. */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;

  return `${Math.round(count / 1_000_000)}M`;
}
