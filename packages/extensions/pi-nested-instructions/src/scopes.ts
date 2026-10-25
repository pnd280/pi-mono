import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fffAdapter, type FffToolKind } from "@pi-mono/utils/fff-tools";
import { containsPath, expandHomePath } from "@pi-mono/utils/paths";
import {
  alternatives,
  globRoot,
  hasGlob,
  isFilenameFilter,
  parseFffScopes
} from "@pi-mono/utils/search-scopes";
import { z } from "zod";

import type * as BashModule from "./bash.ts";
import type { PathHint } from "./bash.ts";
import { instructionNames } from "./storage.ts";

// The shell parser loads on the first Bash call instead of at startup.
// Parallel calls share one import: under jiti a concurrent import can return a partly evaluated module.
let bashModule: Promise<typeof BashModule> | undefined;
const loadBash = () => (bashModule ??= import("./bash.ts"));

export type Invocation = {
  toolCallId: string;
  /** The persisted assistant entry for a direct call; nested calls have no transcript entry. */
  callEntryId?: string;
  parentToolCallId?: string;
  toolName: string;
  input: unknown;
  sourceInfo?: NonNullable<Parameters<typeof fffAdapter>[0]>["sourceInfo"];
};

export type Scope = {
  directories: string[];
  reads: string[];
};

const inputSchema = z.object({
  path: z.string().max(65536).nullish(),
  pattern: z.string().max(65536).nullish(),
  constraints: z.string().max(65536).nullish(),
  glob: z.string().max(65536).nullish(),
  command: z.string().max(65536).nullish()
});

type Input = z.infer<typeof inputSchema>;

export function nestedPath(cwd: string, target: string): boolean {
  // Compare through path.relative so case-insensitive Windows paths equal to cwd stay excluded.
  return containsPath(cwd, target) && path.relative(cwd, target) !== "";
}

function resolveInput(value: string, base: string, expandHome = true): string {
  return path.resolve(base, expandHome ? expandHomePath(value, homedir()) : value);
}

async function fffHints(kind: FffToolKind, input: Input, cwd: string): Promise<PathHint[]> {
  const query = input.pattern;
  let existing = false;

  if (kind === "find" && query?.includes("/")) {
    existing = await stat(resolveInput(query, cwd)).then(
      () => true,
      () => false
    );
  }

  const { expressions } = parseFffScopes(kind, input, cwd, existing);

  return expressions
    .filter(({ source, value }) => source !== "path" || !isFilenameFilter(value))
    .map(({ value, directoryOnly }) => ({
      value,
      cwd,
      kind: directoryOnly ? "directory" : "auto",
      read: kind !== "find",
      pattern: true
    }));
}

async function hints(invocation: Invocation, cwd: string): Promise<PathHint[]> {
  const parsed = inputSchema.safeParse(invocation.input);
  if (!parsed.success) return [];
  const input = parsed.data;
  const kind = fffAdapter(
    invocation.sourceInfo
      ? { name: invocation.toolName, sourceInfo: invocation.sourceInfo }
      : undefined
  );
  if (kind) return fffHints(kind, input, cwd);

  return nativeHints(invocation.toolName, input, cwd);
}

/** Pi's native Windows drive aliases: `/c/dir`, `/mnt/c/dir`, and `/cygdrive/c/dir` become `C:\dir`. */
function windowsDrivePath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return value;
  const match = /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i.exec(value);
  if (!match?.[1]) return value;

  return `${match[1].toUpperCase()}:\\${match[2]?.replaceAll("/", "\\") ?? ""}`;
}

// Pi's native tool path syntax, kept separate from Bash and FFF path semantics.
function nativePath(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  let normalized = value.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ").replace(/^@/, "");
  if (process.platform === "win32") normalized = windowsDrivePath(normalized);

  return normalized.startsWith("file://") ? fileURLToPath(normalized) : normalized;
}

async function nativeHints(name: string, input: Input, cwd: string): Promise<PathHint[]> {
  const output: PathHint[] = [];
  const searchPath = nativePath(input.path);
  const base = resolveInput(searchPath ?? ".", cwd);

  const add = (
    value: string | null | undefined,
    kind: PathHint["kind"],
    read: boolean,
    pattern = false,
    relativeTo = cwd
  ) => {
    if (value) output.push({ value, cwd: relativeTo, kind, read, pattern });
  };

  switch (name) {
    case "read":
      add(searchPath, "auto", true);
      break;
    case "ls":
      add(searchPath, "directory", false);
      break;

    case "find":
      add(searchPath, "directory", false);
      // Unrooted filename patterns do not identify a directory.
      if (input.pattern?.includes("/")) add(input.pattern, "auto", false, true, base);
      break;

    case "grep":
      add(searchPath, "auto", true);
      if (input.glob?.includes("/") && !input.glob.startsWith("!"))
        add(input.glob, "auto", true, true, base);
      break;

    case "bash": {
      const { bashHints } = await loadBash();

      return bashHints(input.command ?? "", cwd, homedir());
    }

    default:
      break;
  }

  return output;
}

export async function inferScope(invocation: Invocation, cwd: string): Promise<Scope> {
  const directories = new Set<string>();
  const reads = new Set<string>();

  for (const hint of await hints(invocation, cwd)) {
    const expressions = hint.pattern ? alternatives(hint.value) : [hint.value];

    for (const expression of expressions) {
      let value = expression;
      let directory = hint.kind === "directory" || expression.endsWith("/");
      const glob = hint.pattern && hasGlob(expression);

      if (glob) {
        const root = globRoot(expression);
        if (!root) continue;
        value = root.prefix;
        directory = true;
      }

      const absolute = resolveInput(value, hint.cwd, hint.expandHome !== false);
      if (!nestedPath(cwd, absolute)) continue;

      // Existence only disambiguates file vs directory; failed accesses still have lexical scope.
      try {
        directory = (await stat(absolute)).isDirectory();
      } catch {
        /* Keep the input's declared kind. */
      }

      if (
        !directory &&
        !glob &&
        nestedPath(cwd, path.dirname(absolute)) &&
        hint.read &&
        !invocation.parentToolCallId &&
        instructionNames.includes(path.basename(absolute))
      )
        reads.add(absolute);

      let ancestor = directory ? absolute : path.dirname(absolute);

      while (nestedPath(cwd, ancestor)) {
        directories.add(ancestor);
        ancestor = path.dirname(ancestor);
      }
    }
  }

  return { directories: [...directories], reads: [...reads] };
}

export function sortDirectories(directories: Iterable<string>): string[] {
  return [...new Set(directories)].sort(
    (a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b)
  );
}
