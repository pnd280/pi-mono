import path from "node:path";

import type { FffToolKind } from "./fff-tools.ts";
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

export interface FffScopeExpression {
  source: "path" | "query";
  value: string;
  directoryOnly: boolean;
  /** Explicit constraints require a viable path; unanchored filename queries remain fuzzy. */
  validatePath: boolean;
}

/** Parse FFF's positive scope constraints and negative query terms without filesystem policy. */
export function parseFffScopes(
  kind: FffToolKind,
  input: {
    path?: string | null | undefined;
    pattern?: string | null | undefined;
    constraints?: string | null | undefined;
  },
  cwd: string,
  existingPatternPath: boolean
): { expressions: FffScopeExpression[]; exclusions: string[] } {
  const expressions: FffScopeExpression[] = [];
  const exclusions: string[] = [];
  const searchPath = input.path?.trim();

  if (kind !== "multi" && searchPath && !searchPath.startsWith("!"))
    expressions.push({ source: "path", ...normalizeFffPath(searchPath, cwd), validatePath: true });

  let query = "";
  if (kind === "multi") query = input.constraints ?? "";
  if (kind === "find") query = input.pattern ?? "";
  // An existing explicit filename-query path can contain spaces. Multi-search
  // constraints always split, irrespective of that caller-supplied fact.
  const tokens =
    kind === "find" && query.includes("/") && existingPatternPath
      ? [query]
      : query.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    if (token.startsWith("!")) exclusions.push(token.slice(1));
    else if (token.includes("/") || hasGlob(token))
      expressions.push({
        source: "query",
        value: token,
        directoryOnly: token.endsWith("/"),
        validatePath:
          kind === "multi" ||
          /^(?:\/|\.{1,2}\/|~\/)/.test(token) ||
          token.endsWith("/") ||
          hasGlob(token)
      });
  }

  return { expressions, exclusions };
}

/** Finite brace alternatives only. Bound expansion, never enumerate the filesystem. */
export function alternatives(value: string): string[] {
  let expanded = [value];

  for (let depth = 0; depth < 8; depth++) {
    const next = expanded.flatMap((entry) => {
      // Skip comma-free groups such as `{1..4}` so later alternatives still expand.
      const match = /\{([^{},]*,[^{}]*)\}/.exec(entry);
      if (!match?.[1]) return [entry];

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
