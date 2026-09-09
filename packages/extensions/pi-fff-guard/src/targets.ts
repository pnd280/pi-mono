import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type SearchKind = "find" | "grep" | "multi";
export interface SearchInput {
  pattern?: string;
  patterns?: string[];
  path?: string;
  exclude?: string | string[];
  constraints?: string;
  caseSensitive?: boolean;
  context?: number;
  cursor?: string;
  limit?: number;
}
export interface Target {
  /** Lexical absolute path, never the resolved dependency-store path. */
  absolute: string;
  directory: boolean;
  filter?: string;
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
}

export function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export function resolvePath(value: string, cwd: string): string {
  return path.resolve(
    cwd,
    value === "~" || value.startsWith("~/") ? path.join(homedir(), value.slice(1)) : value,
  );
}

export function hasGlob(value: string): boolean {
  return /[*?[{]/.test(value);
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
          (part) => entry.slice(0, match.index) + part + entry.slice(match.index + match[0].length),
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
    filter: parts.slice(boundary).join("/"),
  };
}

export async function existingTarget(expression: string, cwd: string): Promise<Target | undefined> {
  // A literal filename containing glob characters takes precedence when it exists.
  const absolute = resolvePath(expression, cwd);
  const info = await fileInfo(absolute);
  if (info?.isDirectory() || info?.isFile()) return { absolute, directory: info.isDirectory() };
  const glob = globRoot(expression);
  if (!glob) return undefined;
  const root = resolvePath(glob.prefix, cwd);
  const rootInfo = await fileInfo(root);
  if (!rootInfo?.isDirectory()) return undefined;
  return { absolute: root, directory: true, filter: glob.filter };
}

async function isMissingPath(expression: string, cwd: string): Promise<boolean> {
  const glob = globRoot(expression);
  if (hasGlob(expression) && !glob) return false;
  // FFF treats a bare filename with an extension as a recursive filter, not a
  // cwd-relative file. An explicit ./ prefix opts into concrete path validation.
  if (!expression.includes("/") && /\.[a-zA-Z][a-zA-Z0-9]{0,9}$/.test(expression)) return false;
  const info = await fileInfo(resolvePath(glob?.prefix ?? expression, cwd));
  return !info || (glob !== undefined && !info.isDirectory());
}

async function fileInfo(absolute: string) {
  try {
    return await stat(absolute);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
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
    .map((entry) => entry.replace(/^!/, ""))
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
  if (contains(root, absolute)) {
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    const suffix = boundary < 0 ? "" : parts.slice(boundary).join("/");
    return "/" + [escapeGlob(relative), suffix].filter(Boolean).join("/");
  }
  if (contains(absolute, root)) {
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
  if (!target.filter) return false;
  const projected = relativeFilter(expression, target.absolute, cwd);
  if (projected === `/${target.filter}` || projected === "/**") return true;
  const basenameFilter = target.filter.replace(/^\*\*\//, "");
  return !basenameFilter.includes("/") && projected === basenameFilter;
}

async function excluded(target: Target, excludes: string[], cwd: string): Promise<boolean> {
  for (const expression of excludes.flatMap(alternatives)) {
    const concrete = await existingTarget(expression, cwd);
    if (
      concrete &&
      !concrete.filter &&
      (concrete.absolute === target.absolute ||
        (concrete.directory && contains(concrete.absolute, target.absolute)))
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
  kind: SearchKind,
  input: SearchInput,
  cwd: string,
  scope: SearchScope,
): Promise<ScopeExpression[]> {
  const expressions: ScopeExpression[] = [];
  if (kind !== "multi" && input.path?.trim())
    expressions.push({ value: input.path.trim(), validatePath: true });
  const tokens =
    kind === "multi"
      ? (input.constraints ?? "").split(/\s+/).filter(Boolean)
      : kind === "find"
        ? await filenameTokens(input.pattern ?? "", cwd)
        : [];
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
      });
  }
  if (expressions.length > 64) throw new Error("too many search scopes");
  return expressions.filter((expression) => !expression.value.startsWith("!"));
}

function intersectTargets(left: Target[], right: Target[]): Target[] {
  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const first of left) {
    for (const second of right) {
      const outer = contains(first.absolute, second.absolute) ? first : second;
      const inner = outer === first ? second : first;
      if (!contains(outer.absolute, inner.absolute)) continue;
      if (!outer.directory && outer.absolute !== inner.absolute) continue;
      if (outer.filter && !["**", "**/*"].includes(outer.filter)) {
        const relative = path.relative(outer.absolute, inner.absolute);
        if (!inner.directory && !matchesFilter(relative, outer.filter)) continue;
      }
      const key = `${inner.absolute}\0${inner.filter ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push(inner);
      }
      if (targets.length > 64) throw new Error("too many intersecting targets");
    }
  }
  return targets;
}

async function collectTargets(
  expressions: ScopeExpression[],
  cwd: string,
  scope: SearchScope,
  signal?: AbortSignal,
): Promise<void> {
  let combined: Target[] | undefined;
  for (const { value: expression, validatePath } of expressions) {
    signal?.throwIfAborted();
    const literal = await existingTarget(expression, cwd);
    const entries = literal && !literal.filter ? [expression] : alternatives(expression);
    const targets: Target[] = [];
    for (const entry of entries) {
      signal?.throwIfAborted();
      const target = await existingTarget(entry, cwd);
      if (target) targets.push(target);
    }
    if (!targets.length) {
      if (validatePath && !scope.missingPath) {
        let allMissing = true;
        for (const entry of entries) {
          signal?.throwIfAborted();
          if (!(await isMissingPath(entry, cwd))) {
            allMissing = false;
            break;
          }
        }
        // A missing brace alternative must not invalidate the other branches.
        if (allMissing) scope.missingPath = expression;
      }
      if (hasGlob(expression)) scope.filters.push(expression);
    } else {
      combined = combined === undefined ? targets : intersectTargets(combined, targets);
    }
  }
  scope.targets = combined ?? [];
}

export async function extractScope(
  kind: SearchKind,
  input: SearchInput,
  cwd: string,
  signal?: AbortSignal,
): Promise<SearchScope> {
  const scope: SearchScope = {
    targets: [],
    excludes: exclusionTokens(input.exclude, cwd),
    filters: [],
  };
  const expressions = await queryExpressions(kind, input, cwd, scope);
  if (scope.excludes.length > 64) throw new Error("too many search exclusions");
  await collectTargets(expressions, cwd, scope, signal);
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
          (!target.directory && !matchesFile(target, filter, cwd)),
      )
    )
      continue;
    if (
      !retained.some(
        (previous) => previous.absolute === target.absolute && previous.filter === target.filter,
      )
    )
      retained.push(target);
  }
  scope.targets = retained;
  return scope;
}
