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
  const { sourceInfo } = tool;
  if (sourceInfo.source === "builtin" || sourceInfo.source === "sdk") return undefined;
  const owned =
    /^npm:@ff-labs\/pi-fff(?:@[^/]+)?$/.test(sourceInfo.source) ||
    /(?:^|\/)@ff-labs\/pi-fff\/(?:src\/)?index\.[cm]?[jt]s$/.test(
      sourceInfo.path.replaceAll("\\", "/")
    );
  return owned ? adapters.get(tool.name) : undefined;
}
