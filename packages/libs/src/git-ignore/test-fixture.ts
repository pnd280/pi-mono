import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type GitFixture = {
  root: string;
  git: (...args: string[]) => string;
  write: (name: string, text?: string) => Promise<string>;
};

const roots = new Set<string>();

export async function createGitFixture(): Promise<GitFixture> {
  const root = await mkdtemp(join(tmpdir(), "git-ignore-"));
  roots.add(root);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
  );
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" }
    });

  const write = async (name: string, text = "fixture\n") => {
    const absolute = join(root, name);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, text);

    return absolute;
  };

  try {
    git("init", "-q");
    git("config", "core.excludesFile", await write("global-excludes", ""));
  } catch (error) {
    roots.delete(root);
    await rm(root, { recursive: true, force: true });
    throw error;
  }

  return { root, git, write };
}

export async function cleanupGitFixtures(): Promise<void> {
  const stale = [...roots];
  roots.clear();
  await Promise.all(stale.map((root) => rm(root, { recursive: true, force: true })));
}
