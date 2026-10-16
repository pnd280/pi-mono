import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { FffToolKind } from "@pi-mono/utils/fff-tools";
import { containsPath, expandHomePath } from "@pi-mono/utils/paths";
import {
  alternatives,
  type FffScopeExpression,
  globRoot,
  hasGlob,
  isFilenameFilter,
  normalizeFffPath,
  parseFffScopes
} from "@pi-mono/utils/search-scopes";
import { z } from "zod";

// Only scope-affecting arguments belong to ignored-path inspection.
const searchInputSchema = z.object({
  pattern: z.string().optional(),
  path: z.string().optional(),
  exclude: z.union([z.string(), z.array(z.string())]).optional(),
  constraints: z.string().optional()
});

type SearchInput = z.infer<typeof searchInputSchema>;

interface ScopeFilter {
  root: string;
  pattern: string;
}

interface Target {
  /** Lexical absolute path, never the resolved dependency-store path. */
  absolute: string;
  directory: boolean;
  /** Intersected globs retain their original roots when a later scope narrows the target. */
  filters: ScopeFilter[];
}

interface SearchScope {
  /** Unique lexical absolute paths, in first-seen order after scope filtering. */
  paths: string[];
  missing: boolean;
}

interface ScopeState {
  targets: Target[];
  excludes: string[];
  filters: string[];
  missing: boolean;
}

function resolvePath(value: string, cwd: string): string {
  return path.resolve(cwd, expandHomePath(value, homedir()));
}

type TargetResolution =
  | { kind: "target"; target: Target }
  | { kind: "missing" }
  | { kind: "unscoped" };

async function resolveTarget(
  expression: string,
  cwd: string,
  directoryOnly = expression.endsWith("/")
): Promise<TargetResolution> {
  // FFF applies bare filenames recursively, even when a cwd match exists.
  if (isFilenameFilter(expression)) return { kind: "unscoped" };
  const glob = globRoot(expression);

  if (hasGlob(expression)) {
    if (!glob) return { kind: "unscoped" };
    const root = resolvePath(glob.prefix, cwd);
    const rootInfo = await fileInfo(root);
    if (!rootInfo?.isDirectory()) return { kind: "missing" };

    return {
      kind: "target",
      target: {
        absolute: root,
        directory: true,
        filters: [{ root, pattern: glob.filter }]
      }
    };
  }

  const absolute = resolvePath(expression, cwd);
  const info = await fileInfo(absolute);
  if (!info || (directoryOnly && !info.isDirectory())) return { kind: "missing" };
  if (info.isDirectory() || info.isFile())
    return {
      kind: "target",
      target: { absolute, directory: info.isDirectory(), filters: [] }
    };

  // An existing unsupported object is not a searchable target, but is not missing.
  return { kind: "unscoped" };
}

async function fileInfo(absolute: string) {
  try {
    return await stat(absolute);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      // A name too long to create cannot exist, so FFF cannot find it either.
      (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "ENAMETOOLONG")
    )
      return undefined;
    throw error;
  }
}

function exclusionTokens(exclude: SearchInput["exclude"], cwd: string): string[] {
  const list = typeof exclude === "string" ? [exclude] : (exclude ?? []);

  // This is pi-fff 0.11.0 normalizeExcludes syntax, including splitting array entries.
  return (
    list
      .flatMap((entry) => entry.split(/[,\s]+/))
      .filter(Boolean)
      .map((entry) => normalizeFffPath(entry.replace(/^!/, ""), cwd))
      .map(({ value, directoryOnly }) =>
        directoryOnly && !value.endsWith("/") ? `${value}/` : value
      )
      // Like upstream, compare with path.relative, which ignores letter case on Windows.
      .filter(
        (entry) =>
          !["**", "**/", "**/*"].includes(entry) &&
          path.relative(cwd, resolvePath(entry, cwd)) !== ""
      )
  );
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
          // Scope values use `/` separators on every platform.
          path.posix.matchesGlob(`component${segment}`, `component${filter}`) &&
          match(segmentIndex + 1, filterIndex + 1);
      memo.set(key, result);

      return result;
    };

    return match(0, 0);
  });
}

function workspaceFilter(expression: string, cwd: string): string {
  if (path.isAbsolute(expression) || expression.startsWith("~/"))
    return path.relative(cwd, resolvePath(expression, cwd)).split(path.sep).join("/");

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
    const resolved = await resolveTarget(expression, cwd);
    const concrete = resolved.kind === "target" ? resolved.target : undefined;
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
  const original = await resolveTarget(expression, cwd, directoryOnly);
  const literal = original.kind === "target" ? original.target : undefined;
  const entries = literal && !literal.filters.length ? [expression] : alternatives(expression);
  const targets: Target[] = [];
  let missing = true;

  for (const entry of entries) {
    signal?.throwIfAborted();
    const resolved =
      entry === expression ? original : await resolveTarget(entry, cwd, directoryOnly);

    if (resolved.kind !== "missing") missing = false;
    if (resolved.kind === "target") targets.push(resolved.target);
  }

  // Brace expansion can remove the wildcard from every branch. Retain the
  // original fixed root rather than requiring one of those branches to exist.
  if (literal && targets.length === 0 && literal.filters.length > 0) targets.push(literal);

  return { targets, missing: targets.length === 0 && missing };
}

async function collectTargets(
  expressions: FffScopeExpression[],
  cwd: string,
  scope: ScopeState,
  signal?: AbortSignal
): Promise<void> {
  let combined: Target[] | undefined;

  for (const { value: expression, validatePath, directoryOnly } of expressions) {
    signal?.throwIfAborted();
    const { targets, missing } = await targetsForExpression(expression, cwd, directoryOnly, signal);

    if (!targets.length) {
      // A missing brace alternative must not invalidate the other branches.
      if (validatePath && missing) scope.missing = true;
      if (hasGlob(expression) || isFilenameFilter(expression)) scope.filters.push(expression);
    } else {
      combined = combined === undefined ? targets : intersectTargets(combined, targets);
    }
  }

  scope.targets = combined ?? [];
}

export async function extractScope(
  kind: FffToolKind,
  input: unknown,
  cwd: string,
  signal?: AbortSignal
): Promise<SearchScope> {
  const parsed = searchInputSchema.safeParse(input);

  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0];
    if (key === "exclude")
      throw new Error("Invalid FFF exclude: expected a string or string array");

    throw new Error(`Invalid FFF ${String(key ?? "input")}: expected a string`);
  }

  const pattern = parsed.data.pattern ?? "";
  const existingPatternPath =
    kind === "find" && pattern.includes("/") && Boolean(await fileInfo(resolvePath(pattern, cwd)));
  const { expressions, exclusions } = parseFffScopes(kind, parsed.data, cwd, existingPatternPath);
  if (expressions.length > 64) throw new Error("too many search scopes");
  const scope: ScopeState = {
    targets: [],
    excludes: [...exclusionTokens(parsed.data.exclude, cwd), ...exclusions],
    filters: [],
    missing: false
  };
  if (scope.excludes.length > 64) throw new Error("too many search exclusions");
  await collectTargets(expressions, cwd, scope, signal);
  // A positive filename filter excluded in full makes even directory targets empty.
  const excludedFilters = new Set(scope.excludes.flatMap(alternatives));

  if (
    scope.filters.some((filter) =>
      alternatives(filter).every((alternative) => excludedFilters.has(alternative))
    )
  ) {
    return { paths: [], missing: scope.missing };
  }

  const paths = new Set<string>();

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
    paths.add(target.absolute);
  }

  return { paths: [...paths], missing: scope.missing };
}
