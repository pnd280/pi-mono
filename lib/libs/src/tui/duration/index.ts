/** Formats a measured duration: `450ms`, `5.3s`, `1m 5s`, `1h 2m 5s`. Values round down. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.floor(ms))}ms`;
  if (ms < 60_000) return `${Math.floor(ms / 100) / 10}s`;
  const total = Math.floor(ms / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  return hours ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}
