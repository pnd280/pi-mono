import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_FILE = "APPEND_SYSTEM.md";

/** Pi joins multiple append sources with the same separator. */
const SEPARATOR = "\n\n";

export interface AppendFiles {
  /**
   * Text Pi loads from its own `APPEND_SYSTEM.md` discovery (`""` when no file exists), or
   * `undefined` when it cannot be read and replacement must be disabled.
   */
  base: string | undefined;
  /** Contents of readable configured files, keyed by absolute path. */
  files: ReadonlyMap<string, string>;
  warnings: string[];
}

function readPrompt(path: string): string {
  // A FIFO at a configured path must not block session startup, even before the type check.
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
 * Loads the base file and configured files once. Base discovery mirrors Pi: trusted project
 * file, then agent file. Pass `projectDir` only for trusted projects, as Pi does.
 */
export function loadAppendFiles({
  projectDir,
  agentDir,
  paths
}: {
  projectDir: string | undefined;
  agentDir: string;
  paths: readonly string[];
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
      warnings.push(`${basePath} could not be read; replacement disabled`);
    }
  }

  const files = new Map<string, string>();

  for (const path of paths) {
    try {
      files.set(path, readPrompt(path));
    } catch {
      warnings.push(`${path} could not be read; rules listing it keep ${BASE_FILE}`);
    }
  }

  return { base, files, warnings };
}

/**
 * Returns the selected files joined in order, only when the current append text equals the
 * discovered base and every file was read. Explicit append text and other extensions' edits are
 * protected only when they differ.
 */
export function resolveAppendReplacement(
  files: AppendFiles,
  current: string,
  paths: readonly string[] | undefined
): string | undefined {
  if (paths === undefined || files.base === undefined || current !== files.base) return undefined;
  const parts: string[] = [];

  for (const path of paths) {
    const text = files.files.get(path);
    if (text === undefined) return undefined;
    parts.push(text);
  }

  const replacement = parts.join(SEPARATOR);

  return replacement === current ? undefined : replacement;
}
