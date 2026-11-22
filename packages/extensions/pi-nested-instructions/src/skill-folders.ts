import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { containsPath } from "@pi-mono/utils/paths";
import ignore, { type Ignore } from "ignore";

import { sortDirectories } from "./scopes.ts";

/** The skill folders of each directory below cwd that has any, broadest directory first. */
export type SkillFolders = ReadonlyMap<string, readonly string[]>;

// Pi's order for the skill folders of one directory.
const folderNames = [path.join(".pi", "skills"), path.join(".agents", "skills")];
// The ignore files that Pi's own skill scanner reads.
const ignoreFiles = [".gitignore", ".ignore", ".fdignore"];

function posixRelative(base: string, target: string): string {
  return path.relative(base, target).split(path.sep).join("/");
}

/** The directories above the physical cwd up to the repository root, root first; none outside a repository. */
async function ancestors(root: string): Promise<string[]> {
  const above: string[] = [];

  for (let directory = root; ;) {
    try {
      await lstat(path.join(directory, ".git"));

      return above;
    } catch {
      const parent = path.dirname(directory);
      if (parent === directory) return [];
      above.unshift(parent);
      directory = parent;
    }
  }
}

/** Rewrites a rule from an ignore file in the directory `prefix` so that it matches paths relative to the base. */
function baseRule(line: string, prefix: string): string[] {
  if (line.startsWith("#")) return [];
  const negated = line.startsWith("!");
  const pattern = negated ? line.slice(1) : line;
  if (!pattern.trim()) return [];
  // Git matches a pattern without a slash before its end at any depth below its file. Pi's scanner anchors it instead.
  const anchored = pattern.trimEnd().replace(/\/$/, "").includes("/");
  const rooted = prefix + (anchored ? pattern.replace(/^\//, "") : `**/${pattern}`);

  return [negated ? `!${rooted}` : rooted];
}

/** Extends the parent's rules with the directory's ignore files, which come later and so win. */
async function withRules(parent: Ignore, directory: string, base: string): Promise<Ignore> {
  const relative = posixRelative(base, directory);
  // Escaped, so that the prefix matches the directory's own name literally.
  const prefix = relative ? `${relative.replace(/[\\*?[!#]/g, "\\$&")}/` : "";
  let matcher = parent;

  for (const name of ignoreFiles) {
    try {
      const content = await readFile(path.join(directory, name), "utf8");
      if (matcher === parent) matcher = ignore().add(parent);
      matcher.add(content.split(/\r?\n/).flatMap((line) => baseRule(line, prefix)));
    } catch {
      /* A missing ignore file adds no rules. */
    }
  }

  return matcher;
}

/** A skill folder can be a symlink, but only to a directory inside cwd. */
async function skillFolder(folder: string, root: string): Promise<boolean> {
  try {
    const target = await realpath(folder);

    return containsPath(root, target) && (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Finds `.pi/skills` and `.agents/skills` in every directory strictly below cwd. The search skips dot directories, `node_modules`, and ignored directories, and never enters a symlinked directory. It finds nothing when cwd is the home directory or above it.
 */
export async function findSkillFolders(cwd: string): Promise<SkillFolders> {
  const found = new Map<string, string[]>();
  let root: string;

  try {
    root = await realpath(cwd);
  } catch {
    return found;
  }

  // Pi waits for this search before the first prompt, so a walk across home can delay startup.
  const home = await realpath(homedir()).catch(() => homedir());
  if (containsPath(root, home)) return found;

  // Rules match paths relative to the repository root, so a directory inside an excluded directory stays excluded, as in git.
  const above = await ancestors(root);
  const base = above[0] ?? root;
  let rules = ignore();
  for (const directory of above) rules = await withRules(rules, directory, base);

  const search = async (directory: string, inherited: Ignore): Promise<void> => {
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    const rules = await withRules(inherited, directory, base);

    await Promise.all(
      entries.map(async (entry) => {
        // A symlink's entry is not a directory, so the search stays inside cwd and cannot loop.
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules")
          return;
        const child = path.join(directory, entry.name);
        if (rules.ignores(`${posixRelative(base, child)}/`)) return;
        // Keys stay lexical, as inferred scopes are.
        const lexical = path.join(cwd, path.relative(root, child));
        const folders: string[] = [];

        for (const name of folderNames)
          if (await skillFolder(path.join(child, name), root))
            folders.push(path.join(lexical, name));

        if (folders.length) found.set(lexical, folders);
        await search(child, rules);
      })
    );
  };

  await search(root, rules);

  return new Map(
    sortDirectories(found.keys()).map((directory) => [directory, found.get(directory) ?? []])
  );
}
