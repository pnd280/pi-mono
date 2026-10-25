const INSTALLED = "/node_modules/";

/**
 * Whether an extension package registered the tool: installed from npm, or loaded from
 * its entry point (`<package>/index.ts` or `<package>/src/index.ts`). An npm source must
 * name the package, and under `node_modules` the package must be the installed one, so
 * `@other/<package>` does not match. Package names are literal constants without
 * regular-expression syntax.
 */
export function registeredBy(
  tool: { sourceInfo: { source: string; path: string } },
  packageName: string
): boolean {
  const { source, path } = tool.sourceInfo;
  if (source === "builtin" || source === "sdk") return false;
  // Pi trims the package spec after `npm:`.
  if (source.startsWith("npm:"))
    return new RegExp(`^${packageName}(?:@[^/]+)?$`).test(source.slice("npm:".length).trim());

  // A leading `/` lets a relative path match whole directory names.
  const normalised = `/${path.replaceAll("\\", "/")}`;
  const installed = normalised.lastIndexOf(INSTALLED);
  const entry = `${packageName}/(?:src/)?index\\.[cm]?[jt]s$`;

  return installed === -1
    ? new RegExp(`/${entry}`).test(normalised)
    : new RegExp(`^${entry}`).test(normalised.slice(installed + INSTALLED.length));
}
