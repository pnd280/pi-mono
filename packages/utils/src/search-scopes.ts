import path from "node:path";

import { containsPath, relativeDisplayPath } from "./paths.ts";

export function hasGlob(value: string): boolean {
  return /[*?[{]/.test(value);
}

function hasFilenameExtension(expression: string): boolean {
  const lastSegment = expression.split("/").at(-1) ?? "";

  return /\.[a-zA-Z][a-zA-Z0-9]{0,9}$/.test(lastSegment);
}

export function isFilenameFilter(expression: string): boolean {
  return !expression.includes("/") && hasFilenameExtension(expression);
}

/** FFF strips local anchors; bare filenames remain recursive filters. */
export function normalizeFffPath(expression: string, cwd: string) {
  const value =
    path.isAbsolute(expression) && containsPath(cwd, expression)
      ? relativeDisplayPath(expression, cwd)
      : expression;
  const normalized = value.replace(/^\.\//, "");

  return {
    value: isFilenameFilter(normalized) ? normalized : expression,
    // FFF appends a slash to extensionless non-glob path fields, so a regular
    // file with that name is not a viable search root.
    directoryOnly: normalized !== "." && !hasGlob(normalized) && !hasFilenameExtension(normalized)
  };
}

/** Filename queries keep an existing explicit path intact; fuzzy terms split on whitespace. */
export function filenameQueryTokens(pattern: string, existingPath: boolean): string[] {
  return pattern.includes("/") && existingPath ? [pattern] : pattern.split(/\s+/).filter(Boolean);
}

/** Finite brace alternatives only. Bound expansion, never enumerate the filesystem. */
export function alternatives(value: string): string[] {
  let expanded = [value];

  for (let depth = 0; depth < 8; depth++) {
    const next = expanded.flatMap((entry) => {
      const match = /\{([^{}]+)\}/.exec(entry);
      if (!match?.[1]?.includes(",")) return [entry];

      return match[1]
        .split(",")
        .map(
          (part) => entry.slice(0, match.index) + part + entry.slice(match.index + match[0].length)
        );
    });
    if (next.length > 64) throw new Error("too many scope alternatives");
    if (next.join("\0") === expanded.join("\0")) return next;
    expanded = next;
  }

  throw new Error("scope alternatives are too deeply nested");
}

export function globRoot(expression: string): { prefix: string; filter: string } | undefined {
  const parts = expression.split("/");
  const boundary = parts.findIndex(hasGlob);
  if (boundary <= 0) return undefined;

  return {
    prefix: parts.slice(0, boundary).join("/") || "/",
    filter: parts.slice(boundary).join("/")
  };
}
