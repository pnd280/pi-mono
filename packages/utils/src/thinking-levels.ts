/**
 * The thinking levels that Pi accepts for a model, including `off`, in Pi's order. Pi exports
 * this list only from an entry point that installed extensions cannot import.
 */
export const MODEL_THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
] as const;
