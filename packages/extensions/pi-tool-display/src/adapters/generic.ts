import type { BorrowedToolResult, ToolDisplayAdapter } from "../contracts.ts";

export const genericAdapter: ToolDisplayAdapter = {
  id: "generic",
  family: "invocation",
  alwaysShowParameters: true
};

/** Generic fallback changes presentation without replacing the selected contract or result. */
export function resolveResultAdapter(
  adapter: ToolDisplayAdapter,
  args: unknown,
  result?: BorrowedToolResult
): ToolDisplayAdapter {
  return result && adapter.supports?.(args, result) === false ? genericAdapter : adapter;
}
