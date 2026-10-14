import { execFile } from "node:child_process";
import { lstat, readlink } from "node:fs/promises";
import path from "node:path";

import type { ExecResult } from "@earendil-works/pi-coding-agent";
import { absolutePathSchema, containsPath } from "@pi-mono/utils/paths";
import { z } from "zod";

const pathsSchema = z.object({ path: absolutePathSchema, cwd: absolutePathSchema });
const deadlineSchema = z
  .int()
  .positive()
  .max(2 ** 31 - 1);

const ignoreResponseSchema = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.literal("")
]);
const ignoreLocationSchema = z.tuple([z.string().min(1), z.string().regex(/^\d+$/)]);

export type GitIgnoreResult =
  | { status: "ignored" | "not-ignored" | "missing" | "cancelled" | "timed-out" }
  | { status: "unavailable"; cause: unknown };

export type GitIgnoreOptions = {
  path: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  git?: GitCommand;
};

type GitOutput = Pick<ExecResult, "code" | "stdout" | "stderr">;

export type GitCommand = (
  cwd: string,
  args: string[],
  input: string | undefined,
  signal: AbortSignal
) => Promise<GitOutput>;

const runGit: GitCommand = (cwd, args, input, signal) =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      LC_ALL: "C",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0"
    };
    // Explicit -C/cwd must not be redirected by a parent Git process's repository.
    for (const key of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_COMMON_DIR",
      "GIT_PREFIX"
    ])
      delete env[key];
    const child = execFile(
      "git",
      args,
      {
        cwd,
        env,
        signal,
        killSignal: "SIGKILL",
        maxBuffer: 128 * 1024,
        encoding: "utf8"
      },
      (error, stdout, stderr) => {
        if (!error) resolve({ code: 0, stdout, stderr });
        else if (typeof error.code === "number" && !error.killed)
          resolve({ code: error.code, stdout, stderr });
        else reject(error);
      }
    );
    child.stdin?.on("error", () => {
      /* Process completion reports early pipe closure. */
    });
    child.stdin?.end(input);
  });

async function repository(
  directory: string,
  signal: AbortSignal,
  git: GitCommand
): Promise<string | undefined> {
  const result = await git(directory, ["rev-parse", "--show-toplevel"], undefined, signal);
  if (result.code === 128 && result.stderr.includes("not a git repository")) return undefined;
  if (result.code !== 0) throw new Error("Git repository discovery failed");
  const root = result.stdout.replace(/\r?\n$/, "");
  if (!absolutePathSchema.safeParse(root).success)
    throw new Error("unexpected Git repository response");

  return root;
}

async function ignoredIn(
  root: string | undefined,
  absolute: string,
  signal: AbortSignal,
  git: GitCommand
): Promise<boolean> {
  if (!root || absolute === root || !containsPath(root, absolute)) return false;
  const relative = path.relative(root, absolute);
  const result = await git(
    root,
    ["check-ignore", "--verbose", "--non-matching", "-z", "--stdin"],
    `${relative}\0`,
    signal
  );
  if (result.code !== 0 && result.code !== 1) throw new Error("Git ignore inspection failed");
  const parsed = ignoreResponseSchema.safeParse(result.stdout.split("\0"));
  if (!parsed.success || parsed.data[3] !== relative)
    throw new Error("unexpected Git ignore response");
  const [source, line, pattern] = parsed.data;
  if (!pattern || pattern.startsWith("!")) return false;
  if (!ignoreLocationSchema.safeParse([source, line]).success)
    throw new Error("unexpected Git ignore record");

  return true;
}

async function firstLink(absolute: string, signal: AbortSignal): Promise<string | undefined> {
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  if (components.length > 128) throw new Error("path component limit exceeded");

  for (const component of components) {
    signal.throwIfAborted();
    current = path.join(current, component);
    if ((await lstat(current)).isSymbolicLink()) return current;
  }

  return undefined;
}

async function inspect(
  absolute: string,
  workspace: string | undefined,
  signal: AbortSignal,
  git: GitCommand,
  seen: Set<string>
): Promise<boolean> {
  signal.throwIfAborted();
  if (seen.has(absolute) || seen.size >= 32) throw new Error("symbolic link cycle or depth limit");
  seen.add(absolute);
  const link = await firstLink(absolute, signal);
  // Never send a descendant through a link to check-ignore: Git rejects it.
  const lexical = link ?? absolute;
  const info = await lstat(lexical);
  const directory = info.isDirectory() ? lexical : path.dirname(lexical);
  const root =
    workspace && containsPath(workspace, lexical)
      ? workspace
      : await repository(directory, signal, git);
  if (await ignoredIn(root, lexical, signal, git)) return true;
  if (!link) return false;
  const destination = path.resolve(
    path.dirname(link),
    await readlink(link),
    path.relative(link, absolute)
  );

  // Keep workspace authority for local destinations; external paths use their own repository.
  return inspect(destination, workspace, signal, git, seen);
}

/** Inspect existing paths using Git's rules, including lexical and resolved link targets.
 * One caller-supplied deadline includes repository discovery and link traversal.
 * No allow/block decision or user-facing diagnostic is made here.
 */
export async function inspectGitIgnore({
  path: absolute,
  cwd,
  timeoutMs,
  signal,
  git = runGit
}: GitIgnoreOptions): Promise<GitIgnoreResult> {
  if (!pathsSchema.safeParse({ path: absolute, cwd }).success)
    throw new TypeError("Git inspection requires absolute paths.");
  if (!deadlineSchema.safeParse(timeoutMs).success)
    throw new RangeError("Git inspection deadline must be a positive 32-bit integer.");
  if (signal?.aborted) return { status: "cancelled" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    const workspace = await repository(cwd, combined, git);
    // Validate final existence before considering lexical link parents. Missing
    // targets must not be blocked merely because an existing parent is ignored.
    await lstat(absolute);
    const ignored = await inspect(absolute, workspace, combined, git, new Set());
    combined.throwIfAborted();

    return { status: ignored ? "ignored" : "not-ignored" };
  } catch (error) {
    if (signal?.aborted) return { status: "cancelled" };
    if (controller.signal.aborted) return { status: "timed-out" };
    // Only probes of the inspected path mean missing; a failed Git spawn is unavailable.
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR") &&
      "syscall" in error &&
      (error.syscall === "lstat" || error.syscall === "readlink")
    )
      return { status: "missing" };

    return { status: "unavailable", cause: error };
  } finally {
    clearTimeout(timeout);
  }
}
