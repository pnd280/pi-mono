import type { ToolInfo } from "@earendil-works/pi-coding-agent";

/**
 * Whether an extension package registered the tool: installed from npm, or loaded from
 * its entry point (`<package>/index.ts` or `<package>/src/index.ts`). Package names are
 * literal constants without regular-expression syntax.
 */
export function registeredBy(tool: ToolInfo, packageName: string): boolean {
  const { source, path } = tool.sourceInfo;
  if (source === "builtin" || source === "sdk") return false;

  return (
    new RegExp(`^npm:${packageName}(?:@[^/]+)?$`).test(source) ||
    new RegExp(`(?:^|/)${packageName}/(?:src/)?index\\.[cm]?[jt]s$`).test(
      path.replaceAll("\\", "/")
    )
  );
}
