import { formatTokenCount } from "@pi-mono/libs/tui/token-count";

import type { ToolDetails } from "./details.ts";

// pi-tool-display imports this module (`pi-subagents/text`) for task cards; keep it free of runtime host imports.

/** A task's usage on its card, or empty without usage. Non-breaking spaces keep the group on one row when it fits. */
export function usageText({ usage }: ToolDetails): string {
  if (!Object.values(usage).some((value) => value > 0)) return "";

  return `↑${formatTokenCount(usage.input)}\u00a0↓${formatTokenCount(usage.output)}\u00a0$${usage.cost.toFixed(2)}`;
}
