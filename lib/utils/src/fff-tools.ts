import { registeredBy } from "./provenance.ts";

export type FffToolKind = "find" | "grep" | "multi";

const adapters: ReadonlyMap<string, FffToolKind> = new Map([
  ["fffind", "find"],
  ["ffgrep", "grep"],
  ["fff-multi-grep", "multi"],
  ["find", "find"],
  ["grep", "grep"],
  ["multi_grep", "multi"]
]);

/** Ownership/name classification only; consumers validate contracts and apply their own policy. */
export function fffAdapter(
  tool: { name: string; sourceInfo: { source: string; path: string } } | undefined
): FffToolKind | undefined {
  if (!tool) return undefined;

  return registeredBy(tool, "@ff-labs/pi-fff") ? adapters.get(tool.name) : undefined;
}
