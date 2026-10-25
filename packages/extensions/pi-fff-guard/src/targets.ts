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

type ScopeFilter = {
  root: string;
  pattern: string;
};

type Target = {
  /** Lexical absolute path, never the resolved dependency-store path. */
  absolute: string;
  directory: boolean;
  /** Intersected globs retain their original roots when a later scope narrows the target. */
  filters: ScopeFilter[];
};

type SearchScope = {
  /** Unique lexical absolute paths, in first-seen order after scope filtering. */
  paths: string[];
  missing: boolean;
};

type ScopeState = {
  targets: Target[];
  excludes: string[];
  filters: string[];
  missing: boolean;
};

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

/**
 * Match scope filters like FFF, including dot components. This is not Git ignore matching.
 * FFF confines wildcards to one component only in an alternative that contains `**`;
 * `componentWise` keeps that mode for a base taken from such an alternative.
 */
function matchesFilter(value: string, expression: string, componentWise = false): boolean {
  const segments = value.split("/");
  if (segments.length > 128 || expression.split("/").length > 128)
    throw new Error("filter component limit exceeded");

  return alternatives(expression).some((alternative) => {
    if (!componentWise && !alternative.includes("**")) return matchesPath(value, alternative);
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
          matchesPath(segment, filter) &&
          match(segmentIndex + 1, filterIndex + 1);
      memo.set(key, result);

      return result;
    };

    return match(0, 0);
  });
}

/** A `*` wildcard, or a test for one character. */
type GlobToken = "*" | ((char: string) => boolean);

// FFF 0.11.0 supports these ASCII classes in bracket expressions.
const posixClasses = new Map([
  ["alnum", /[0-9A-Za-z]/],
  ["alpha", /[A-Za-z]/],
  ["blank", /[\t ]/],
  ["cntrl", /[^ -~\x80-\u{10ffff}]/u],
  ["digit", /[0-9]/],
  ["graph", /[!-~]/],
  ["lower", /[a-z]/],
  ["print", /[ -~]/],
  ["punct", /[!-/:-@[-`{-~]/],
  ["space", /[\t-\r ]/],
  ["upper", /[A-Z]/],
  ["xdigit", /[0-9A-Fa-f]/]
]);

const codePoint = (char: string) => char.codePointAt(0) ?? -1;

/** Like FFF, read `\` literally inside brackets and treat a reversed range as empty. */
function bracketTest(negated: boolean, members: string): (char: string) => boolean {
  const tests = [...members.matchAll(/\[:([a-z]+):\]|([^])-([^])|([^])/gu)].map(
    ([, name, from = "", to = "", single]) =>
      (char: string) => {
        if (name !== undefined) return posixClasses.get(name)?.test(char) ?? false;
        if (single !== undefined) return char === single;

        return codePoint(from) <= codePoint(char) && codePoint(char) <= codePoint(to);
      }
  );

  return (char) => tests.some((test) => test(char)) !== negated;
}

/**
 * Match the whole value like FFF; `*`, `?`, and bracket expressions also match `/`.
 * Bracket expressions compare original characters, so ranges such as `[.-0]` include `/`.
 */
function matchesPath(value: string, glob: string): boolean {
  const tokens = [
    ...glob.matchAll(
      /\\([^])|(\*)|(\?)|\[([!^]?)((?:\]|\[:[a-z]+:\]|[^\]])(?:\[:[a-z]+:\]|[^\]])*)\]|([^])/gu
    )
  ].map(([, escaped, star, question, negation = "", members, char]): GlobToken => {
    if (star) return "*";
    if (question) return () => true;
    if (members !== undefined) return bracketTest(negation !== "", members);

    return (next) => next === (escaped ?? char);
  });
  const chars = Array.from(value);
  let token = 0;
  let index = 0;
  // Retrying only from the latest `*` bounds the work by the product of both lengths.
  let retry: { token: number; index: number } | undefined;

  while (index < chars.length) {
    const current = tokens[token];
    if (current === "*") {
      token++;
      retry = { token, index };
    } else if (current?.(chars[index] ?? "")) {
      token++;
      index++;
    } else if (retry) {
      retry.index++;
      ({ token, index } = retry);
    } else return false;
  }

  return tokens.slice(token).every((current) => current === "*");
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
      if (matchesFilter(relative, base, true)) return true;
    }

    // Without `**`, a final `*` also matches `/`, so it covers every file below a matched prefix.
    if (
      target.directory &&
      relative &&
      glob.includes("/") &&
      !glob.includes("**") &&
      glob.endsWith("*") &&
      matchesPath(`${relative}/`, glob)
    )
      return true;
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
  let missingDirectories = true;

  for (const entry of entries) {
    signal?.throwIfAborted();
    const resolved =
      entry === expression ? original : await resolveTarget(entry, cwd, directoryOnly);

    if (resolved.kind !== "missing") missing = false;
    if (resolved.kind === "target") targets.push(resolved.target);
    // Brace expansion can remove the wildcard from a branch. A missing file in an existing
    // directory then means only that the glob matches nothing, not that a directory is missing.
    if (
      literal &&
      missingDirectories &&
      (resolved.kind !== "missing" ||
        (!hasGlob(entry) &&
          !entry.endsWith("/") &&
          (await fileInfo(path.dirname(resolvePath(entry, cwd))))?.isDirectory()))
    )
      missingDirectories = false;
  }

  // Retain the glob's fixed root unless every branch has a missing directory.
  if (literal && targets.length === 0 && !missingDirectories) targets.push(literal);

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
