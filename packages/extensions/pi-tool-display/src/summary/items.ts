import type { SummaryItem } from "../contracts.ts";
import { resolveInvocationPath } from "../invocation.ts";

/** Files and directories are identified by their lexically resolved path, never by lookup. */
export function pathSummaryItem(
  category: string,
  path: string,
  cwd: string
): SummaryItem & { identity: string } {
  return { category, identity: `path\0${resolveInvocationPath(path, cwd) ?? path}` };
}
