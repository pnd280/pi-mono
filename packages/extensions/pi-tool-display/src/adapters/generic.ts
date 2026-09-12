import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import type { ToolDisplayAdapter } from "./types.ts";

export const genericAdapter: ToolDisplayAdapter = { id: "generic", family: "invocation" };

/** A fallback is a projection, not a replacement of the call's selected contract or result. */
export function resolveResultAdapter(
  adapter: ToolDisplayAdapter,
  args: unknown,
  result?: AgentToolResult<unknown>
): ToolDisplayAdapter {
  return result && adapter.supports?.(args, result) === false ? genericAdapter : adapter;
}
