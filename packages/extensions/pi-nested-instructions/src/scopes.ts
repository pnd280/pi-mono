import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fffAdapter, type FffToolKind } from "@pi-mono/utils/fff-tools";
import { containsPath, expandHomePath } from "@pi-mono/utils/paths";
import {
  alternatives,
  filenameQueryTokens,
  globRoot,
  hasGlob,
  isFilenameFilter,
  normalizeFffPath
} from "@pi-mono/utils/search-scopes";
import { z } from "zod";

import { bashHints, type PathHint } from "./bash.ts";
import { instructionNames } from "./storage.ts";

export interface Invocation {
  toolCallId: string;
  parentToolCallId?: string;
  toolName: string;
  input: unknown;
  sourceInfo?: { source: string; path: string };
}

export interface Scope {
  directories: string[];
  reads: string[];
}

const inputSchema = z.object({
  path: z.string().max(65536).nullish(),
  pattern: z.string().max(65536).nullish(),
  constraints: z.string().max(65536).nullish(),
  glob: z.string().max(65536).nullish(),
  command: z.string().max(65536).nullish()
});

type Input = z.infer<typeof inputSchema>;

export function nestedPath(cwd: string, target: string): boolean {
  return target !== cwd && containsPath(cwd, target);
}

function resolveInput(value: string, base: string, expandHome = true): string {
  return path.resolve(base, expandHome ? expandHomePath(value, homedir()) : value);
}

async function fffHints(kind: FffToolKind, input: Input, cwd: string): Promise<PathHint[]> {
  const output: PathHint[] = [];
  const searchPath = input.path?.trim();

  if (kind !== "multi" && searchPath && !searchPath.startsWith("!")) {
    const normalized = normalizeFffPath(searchPath, cwd);

    if (!isFilenameFilter(normalized.value))
      output.push({
        value: normalized.value,
        cwd,
        kind: normalized.directoryOnly ? "directory" : "auto",
        read: kind === "grep",
        pattern: true
      });
  }

  let query: string | null | undefined;
  if (kind === "multi") query = input.constraints;
  if (kind === "find") query = input.pattern;

  let existing = false;

  if (kind === "find" && query?.includes("/")) {
    existing = await stat(resolveInput(query, cwd)).then(
      () => true,
      () => false
    );
  }

  for (const token of filenameQueryTokens(query ?? "", existing)) {
    if (!token.startsWith("!") && (token.includes("/") || hasGlob(token)))
      output.push({
        value: token,
        cwd,
        kind: token.endsWith("/") ? "directory" : "auto",
        read: kind === "multi",
        pattern: true
      });
  }

  return output;
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

// Pi's native tool path syntax, kept separate from Bash and FFF path semantics.
function nativePath(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/^@/, "");

  return normalized.startsWith("file://") ? fileURLToPath(normalized) : normalized;
}

function nativeHints(name: string, input: Input, cwd: string): PathHint[] {
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
      add(searchPath, "file", true);
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

    case "bash":
      return bashHints(input.command ?? "", cwd, homedir());
    default:
      break;
  }

  return output;
}

/** Broad-to-narrow lexical ancestors, excluding cwd itself and all external paths. */
export function directoryChain(directory: string, cwd: string): string[] {
  const chain: string[] = [];
  let current = directory;

  while (nestedPath(cwd, current)) {
    chain.unshift(current);
    current = path.dirname(current);
  }

  return chain;
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
      for (const ancestor of directoryChain(directory ? absolute : path.dirname(absolute), cwd))
        directories.add(ancestor);
    }
  }

  return { directories: sortDirectories(directories), reads: [...reads] };
}

export function sortDirectories(directories: Iterable<string>): string[] {
  return [...new Set(directories)].sort(
    (a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b)
  );
}
