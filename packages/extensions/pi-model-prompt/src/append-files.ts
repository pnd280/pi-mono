import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_FILE = "APPEND_SYSTEM.md";

export function variantFileName(variant: string): string {
  return `APPEND_SYSTEM.${variant}.md`;
}

export interface AppendFiles {
  /**
   * Text Pi loads from its own `APPEND_SYSTEM.md` discovery (`""` when no file exists), or
   * `undefined` when it cannot be read and replacement must be disabled.
   */
  base: string | undefined;
  /** Replacement text for variants whose file outranks the base file. */
  variants: ReadonlyMap<string, string>;
  warnings: string[];
}

interface Candidate {
  path: string;
  variant: boolean;
}

function readPrompt(path: string): string {
  // A FIFO at a variant path must not block session startup, even before the type check.
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    if (!fstatSync(descriptor).isFile()) throw new Error("Prompt must be a regular file.");
    const text = readFileSync(descriptor, "utf8");

    // Matches Pi's own loader so unchanged base text compares equal.
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Loads the base and variant files once. Precedence is scope-first: project variant, project
 * base, agent variant, agent base. Pass `projectDir` only for trusted projects, as Pi does.
 */
export function loadAppendFiles({
  projectDir,
  agentDir,
  variants
}: {
  projectDir: string | undefined;
  agentDir: string;
  variants: readonly string[];
}): AppendFiles {
  const warnings: string[] = [];
  const dirs = projectDir === undefined ? [agentDir] : [projectDir, agentDir];

  const basePath = dirs.map((dir) => join(dir, BASE_FILE)).find((path) => existsSync(path));
  let base: string | undefined = "";

  if (basePath !== undefined) {
    try {
      base = readPrompt(basePath);
    } catch {
      base = undefined;
      warnings.push(`${basePath} could not be read; variants disabled`);
    }
  }

  const loaded = new Map<string, string>();

  for (const variant of variants) {
    const candidates: Candidate[] = dirs.flatMap((dir) => [
      { path: join(dir, variantFileName(variant)), variant: true },
      { path: join(dir, BASE_FILE), variant: false }
    ]);

    if (!candidates.some((candidate) => candidate.variant && existsSync(candidate.path))) {
      warnings.push(`no ${variantFileName(variant)} found; using ${BASE_FILE}`);
      continue;
    }

    for (const candidate of candidates) {
      if (!existsSync(candidate.path)) continue;
      if (!candidate.variant) break;

      try {
        loaded.set(variant, readPrompt(candidate.path));
        break;
      } catch {
        warnings.push(`${candidate.path} could not be read; falling back`);
      }
    }
  }

  return { base, variants: loaded, warnings };
}

/**
 * Returns replacement text only when the current append text equals the discovered base.
 * Explicit append text and other extensions' edits are protected only when they differ.
 */
export function resolveAppendReplacement(
  files: AppendFiles,
  current: string,
  variant: string | undefined
): string | undefined {
  if (variant === undefined || files.base === undefined || current !== files.base) return undefined;
  const replacement = files.variants.get(variant);

  return replacement === current ? undefined : replacement;
}
