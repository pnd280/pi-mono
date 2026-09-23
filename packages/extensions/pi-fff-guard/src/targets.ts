import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { FffToolKind } from "@pi-mono/utils/fff-tools";
import { containsPath, expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

export const searchInputSchema = z.object({
  pattern: z.string().optional(),
  patterns: z.array(z.string()).optional(),
  path: z.string().optional(),
  exclude: z.union([z.string(), z.array(z.string())]).optional(),
  constraints: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  context: z.number().optional(),
  cursor: z.string().optional(),
  limit: z.number().optional()
});

export type SearchInput = z.infer<typeof searchInputSchema>;

interface ScopeFilter {
  root: string;
  pattern: string;
}

export interface Target {
  /** Lexical absolute path, never the resolved dependency-store path. */
  absolute: string;
  directory: boolean;
  /** Intersected globs retain their original roots when a later scope narrows the target. */
  filters: ScopeFilter[];
}

export interface SearchScope {
  targets: Target[];
  excludes: string[];
  filters: string[];
  missingPath?: string;
}

interface ScopeExpression {
  value: string;
  validatePath: boolean;
  directoryOnly: boolean;
}

export function resolvePath(value: string, cwd: string): string {
  return path.resolve(cwd, expandHomePath(value, homedir()));
}

export function hasGlob(value: string): boolean {
  return /[*?[{]/.test(value);
}

function hasFilenameExtension(expression: string): boolean {
  const lastSegment = expression.split("/").at(-1) ?? "";

  return /\.[a-zA-Z][a-zA-Z0-9]{0,9}$/.test(lastSegment);
}

function isFilenameFilter(expression: string): boolean {
  return !expression.includes("/") && hasFilenameExtension(expression);
}

function normalizePathField(expression: string, cwd: string) {
  // FFF normalizes path/exclude fields before parsing. Workspace-local absolute
  // paths and ./ prefixes cannot make a bare filename filter concrete.
  const value =
    path.isAbsolute(expression) && containsPath(cwd, expression)
      ? path.relative(cwd, expression).split(path.sep).join("/") || "."
      : expression;
  const normalized = value.replace(/^\.\//, "");

  return {
    value: isFilenameFilter(normalized) ? normalized : expression,
    // FFF appends a slash to extensionless non-glob path fields. A regular
    // file with that name is therefore not a viable search root.
    directoryOnly: normalized !== "." && !hasGlob(normalized) && !hasFilenameExtension(normalized)
  };
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

function globRoot(expression: string): { prefix: string; filter: string } | undefined {
  const parts = expression.split("/");
  const boundary = parts.findIndex(hasGlob);
  if (boundary <= 0) return undefined;

  return {
    prefix: parts.slice(0, boundary).join("/") || "/",
    filter: parts.slice(boundary).join("/")
  };
}

export async function existingTarget(
  expression: string,
  cwd: string,
  directoryOnly = expression.endsWith("/")
): Promise<Target | undefined> {
  // FFF applies bare filenames recursively, even when a cwd match exists.
  if (isFilenameFilter(expression)) return undefined;
  const glob = globRoot(expression);

  if (hasGlob(expression)) {
    if (!glob) return undefined;
    const root = resolvePath(glob.prefix, cwd);
    const rootInfo = await fileInfo(root);
    if (!rootInfo?.isDirectory()) return undefined;

    return {
      absolute: root,
      directory: true,
      filters: [{ root, pattern: glob.filter }]
    };
  }

  const absolute = resolvePath(expression, cwd);
  const info = await fileInfo(absolute);
  if (info?.isDirectory() || (info?.isFile() && !directoryOnly))
    return { absolute, directory: info.isDirectory(), filters: [] };

  return undefined;
}

async function isMissingPath(
  expression: string,
  cwd: string,
  directoryOnly: boolean
): Promise<boolean> {
  const glob = globRoot(expression);
  if (hasGlob(expression) && !glob) return false;
  // Bare filenames remain recursive filters after path-field normalization.
  if (isFilenameFilter(expression)) return false;
  const info = await fileInfo(resolvePath(glob?.prefix ?? expression, cwd));

  return (
    !info || (directoryOnly && !info.isDirectory()) || (glob !== undefined && !info.isDirectory())
  );
}

async function fileInfo(absolute: string) {
  try {
    return await stat(absolute);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    )
      return undefined;
    throw error;
  }
}

function exclusionTokens(exclude: SearchInput["exclude"], cwd: string): string[] {
  const list = typeof exclude === "string" ? [exclude] : (exclude ?? []);

  // This is pi-fff 0.10.6 normalizeExcludes syntax, including splitting array entries.
  return list
    .flatMap((entry) => entry.split(/[,\s]+/))
    .filter(Boolean)
    .map((entry) => normalizePathField(entry.replace(/^!/, ""), cwd))
    .map(({ value, directoryOnly }) =>
      directoryOnly && !value.endsWith("/") ? `${value}/` : value
    )
    .filter((entry) => !["**", "**/", "**/*"].includes(entry) && resolvePath(entry, cwd) !== cwd);
}

function isConstraint(token: string): boolean {
  return token.includes("/") || hasGlob(token);
}

/** Translate a filter into the target directory's coordinate system. */
function relativeFilter(expression: string, root: string, cwd: string): string | undefined {
  let value = expression.replace(/^\.\//, "");
  if (!value.includes("/") && !value.startsWith("~")) return value;
  // Unanchored recursive filters retain their meaning below any selected root.
  if (value.startsWith("**/")) return value;
  value = value.replace(/\/+$/, "");
  const parts = value.split("/");
  const boundary = parts.findIndex(hasGlob);
  const prefix = boundary < 0 ? value : parts.slice(0, boundary).join("/") || "/";
  const absolute = resolvePath(prefix, cwd);

  if (containsPath(root, absolute)) {
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const suffix = boundary < 0 ? "" : parts.slice(boundary).join("/");

    return "/" + [escapeGlob(relative), suffix].filter(Boolean).join("/");
  }

  if (containsPath(absolute, root)) {
    if (boundary < 0) return "/**";
    const suffix = parts.slice(boundary).join("/");
    if (suffix === "**" || suffix === "**/*") return "/**";
    // Only basename-recursive patterns are invariant when descending the root.
    if (/^\*\*\/[^/]+$/.test(suffix)) return suffix;

    return undefined;
  }

  return ""; // A disjoint anchored constraint cannot match under this root.
}

function escapeGlob(value: string): string {
  return value.replace(/[\\*?[\]{}!]/g, "\\$&");
}

/** Match scope filters, including dot components. This is not Git ignore matching. */
function matchesFilter(value: string, expression: string): boolean {
  const segments = value.split("/");
  if (segments.length > 128 || expression.split("/").length > 128)
    throw new Error("filter component limit exceeded");

  return alternatives(expression).some((alternative) => {
    const filters = alternative.split("/");
    const memo = new Map<string, boolean>();

    const match = (segmentIndex: number, filterIndex: number): boolean => {
      const key = `${segmentIndex}:${filterIndex}`;
      const previous = memo.get(key);
      if (previous !== undefined) return previous;
      const filter = filters[filterIndex];
      const segment = segments[segmentIndex];
      let result: boolean;
      if (filter === undefined) result = segment === undefined;
      else if (filter === "**")
        result =
          match(segmentIndex, filterIndex + 1) ||
          (segment !== undefined && match(segmentIndex + 1, filterIndex));
      else
        result =
          segment !== undefined &&
          path.matchesGlob(`component${segment}`, `component${filter}`) &&
          match(segmentIndex + 1, filterIndex + 1);
      memo.set(key, result);

      return result;
    };

    return match(0, 0);
  });
}

function workspaceFilter(expression: string, cwd: string): string {
  if (path.isAbsolute(expression) || expression.startsWith("~/"))
    return path.relative(cwd, resolvePath(expression, cwd));

  return expression.replace(/^\.\//, "");
}

function matchesFile(target: Target, expression: string, cwd: string): boolean {
  const glob = workspaceFilter(expression, cwd);
  const relative = path.relative(cwd, target.absolute).split(path.sep).join("/");

  return matchesFilter(glob.includes("/") ? relative : path.basename(relative), glob);
}

function excludesFilter(target: Target, expression: string, cwd: string): boolean {
  return target.filters.some((filter) => {
    const projected = relativeFilter(expression, filter.root, cwd);
    if (projected === `/${filter.pattern}` || projected === "/**") return true;
    const basenameFilter = filter.pattern.replace(/^\*\*\//, "");

    return !basenameFilter.includes("/") && projected === basenameFilter;
  });
}

async function excluded(target: Target, excludes: string[], cwd: string): Promise<boolean> {
  for (const expression of excludes.flatMap(alternatives)) {
    const concrete = await existingTarget(expression, cwd);
    if (
      concrete &&
      !concrete.filters.length &&
      (concrete.absolute === target.absolute ||
        (concrete.directory && containsPath(concrete.absolute, target.absolute)))
    )
      return true;
    const relative = path.relative(cwd, target.absolute).split(path.sep).join("/");
    const glob = workspaceFilter(expression, cwd);
    if (!target.directory && matchesFile(target, expression, cwd)) return true;
    if (excludesFilter(target, expression, cwd)) return true;

    if (target.directory && /\/\*\*(?:\/\*)?$/.test(glob)) {
      const base = glob.replace(/\/\*\*(?:\/\*)?$/, "");
      if (matchesFilter(relative, base)) return true;
    }
  }

  return false;
}

async function filenameTokens(pattern: string, cwd: string): Promise<string[]> {
  // Do not split a literal explicit path on spaces or commas. Bare fuzzy words
  // remain fuzzy even when a file with that exact name happens to exist.
  if (pattern.includes("/") && (await fileInfo(resolvePath(pattern, cwd)))) return [pattern];

  return pattern.split(/\s+/).filter(Boolean);
}

async function queryExpressions(
  kind: FffToolKind,
  input: SearchInput,
  cwd: string,
  scope: SearchScope
): Promise<ScopeExpression[]> {
  const expressions: ScopeExpression[] = [];

  if (kind !== "multi" && input.path?.trim()) {
    const normalized = normalizePathField(input.path.trim(), cwd);

    expressions.push({ ...normalized, validatePath: true });
  }

  let tokens: string[] = [];

  if (kind === "multi") tokens = (input.constraints ?? "").split(/\s+/).filter(Boolean);
  else if (kind === "find") tokens = await filenameTokens(input.pattern ?? "", cwd);

  for (const token of tokens) {
    if (token.startsWith("!")) scope.excludes.push(token.slice(1));
    else if (isConstraint(token))
      expressions.push({
        value: token,
        // Filename queries remain fuzzy unless explicitly anchored, a directory
        // prefix, or a glob. Content patterns never enter this collection.
        validatePath:
          kind === "multi" ||
          /^(?:\/|\.{1,2}\/|~\/)/.test(token) ||
          token.endsWith("/") ||
          hasGlob(token),
        directoryOnly: token.endsWith("/")
      });
  }

  if (expressions.length > 64) throw new Error("too many search scopes");

  return expressions.filter((expression) => !expression.value.startsWith("!"));
}

function targetKey(target: Target): string {
  return JSON.stringify([target.absolute, target.filters]);
}

function intersectTargets(left: Target[], right: Target[]): Target[] {
  const targets: Target[] = [];
  const seen = new Set<string>();

  for (const first of left) {
    for (const second of right) {
      const outer = containsPath(first.absolute, second.absolute) ? first : second;
      const inner = outer === first ? second : first;
      if (!containsPath(outer.absolute, inner.absolute)) continue;
      if (!outer.directory && outer.absolute !== inner.absolute) continue;
      const filters = [...first.filters, ...second.filters];
      if (
        !inner.directory &&
        filters.some(
          (filter) =>
            !matchesFilter(
              path.relative(filter.root, inner.absolute).split(path.sep).join("/"),
              filter.pattern
            )
        )
      )
        continue;
      const target = { ...inner, filters };
      const key = targetKey(target);

      if (!seen.has(key)) {
        seen.add(key);
        targets.push(target);
      }

      if (targets.length > 64) throw new Error("too many intersecting targets");
    }
  }

  return targets;
}

async function targetsForExpression(
  expression: string,
  cwd: string,
  directoryOnly: boolean,
  signal?: AbortSignal
) {
  const literal = await existingTarget(expression, cwd, directoryOnly);
  const entries = literal && !literal.filters.length ? [expression] : alternatives(expression);
  const targets: Target[] = [];

  for (const entry of entries) {
    signal?.throwIfAborted();
    const target = await existingTarget(entry, cwd, directoryOnly);

    if (target) targets.push(target);
  }

  // Brace expansion can remove the wildcard from every branch. Retain the
  // original fixed root rather than requiring one of those branches to exist.
  if (literal && targets.length === 0 && literal.filters.length > 0) targets.push(literal);

  return { entries, targets };
}

async function collectTargets(
  expressions: ScopeExpression[],
  cwd: string,
  scope: SearchScope,
  signal?: AbortSignal
): Promise<void> {
  let combined: Target[] | undefined;

  for (const { value: expression, validatePath, directoryOnly } of expressions) {
    signal?.throwIfAborted();
    const { entries, targets } = await targetsForExpression(expression, cwd, directoryOnly, signal);

    if (!targets.length) {
      if (validatePath && !scope.missingPath) {
        let allMissing = true;

        for (const entry of entries) {
          signal?.throwIfAborted();

          if (!(await isMissingPath(entry, cwd, directoryOnly))) {
            allMissing = false;
            break;
          }
        }

        // A missing brace alternative must not invalidate the other branches.
        if (allMissing) scope.missingPath = expression;
      }

      if (hasGlob(expression) || isFilenameFilter(expression)) scope.filters.push(expression);
    } else {
      combined = combined === undefined ? targets : intersectTargets(combined, targets);
    }
  }

  scope.targets = combined ?? [];
}

export async function extractScope(
  kind: FffToolKind,
  input: SearchInput,
  cwd: string,
  signal?: AbortSignal
): Promise<SearchScope> {
  const scope: SearchScope = {
    targets: [],
    excludes: exclusionTokens(input.exclude, cwd),
    filters: []
  };
  const expressions = await queryExpressions(kind, input, cwd, scope);
  if (scope.excludes.length > 64) throw new Error("too many search exclusions");
  await collectTargets(expressions, cwd, scope, signal);
  // A positive filename filter excluded in full makes even directory targets empty.
  const excludedFilters = new Set(scope.excludes.flatMap(alternatives));

  if (
    scope.filters.some((filter) =>
      alternatives(filter).every((alternative) => excludedFilters.has(alternative))
    )
  ) {
    scope.targets = [];

    return scope;
  }

  const retained: Target[] = [];

  for (const target of scope.targets) {
    signal?.throwIfAborted();
    if (await excluded(target, scope.excludes, cwd)) continue;
    // Disjoint positive filters prove this target is not part of the search.
    const root = target.directory ? target.absolute : path.dirname(target.absolute);
    if (
      scope.filters.some(
        (filter) =>
          relativeFilter(filter, root, cwd) === "" ||
          (!target.directory && !matchesFile(target, filter, cwd))
      )
    )
      continue;
    if (!retained.some((previous) => targetKey(previous) === targetKey(target)))
      retained.push(target);
  }

  scope.targets = retained;

  return scope;
}
