import { execFile } from "node:child_process";
import { lstat, readlink } from "node:fs/promises";
import path from "node:path";

import { contains } from "./targets.ts";

export interface IgnoreRecord {
  path: string;
  source: string;
  line: string;
  pattern: string;
}
export type Detection =
  | { status: "ignored"; record: IgnoreRecord }
  | { status: "allowed" }
  | { status: "unavailable"; diagnostic: string }
  | { status: "cancelled" };
interface GitOutput {
  code: number;
  stdout: string;
  stderr: string;
}
export type GitCommand = (
  cwd: string,
  args: string[],
  input: string | undefined,
  signal: AbortSignal
) => Promise<GitOutput>;

export const runGit: GitCommand = (cwd, args, input, signal) =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const env = { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };
    // Explicit -C/cwd must not be redirected by a parent Git process's repository.
    for (const key of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_COMMON_DIR",
      "GIT_PREFIX"
    ])
      delete env[key as keyof typeof env];
    const child = execFile(
      "git",
      args,
      {
        cwd,
        env,
        signal,
        timeout: 2000,
        killSignal: "SIGKILL",
        maxBuffer: 128 * 1024,
        encoding: "utf8"
      },
      (error, stdout, stderr) => {
        if (error && (typeof error.code !== "number" || error.killed)) reject(error);
        else resolve({ code: (error?.code as number | undefined) ?? 0, stdout, stderr });
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
  if (!path.isAbsolute(root)) throw new Error("unexpected Git repository response");
  return root;
}

async function ignoredIn(
  root: string | undefined,
  absolute: string,
  signal: AbortSignal,
  git: GitCommand
): Promise<IgnoreRecord | undefined> {
  if (!root || absolute === root || !contains(root, absolute)) return undefined;
  const relative = path.relative(root, absolute);
  const result = await git(
    root,
    ["check-ignore", "--verbose", "--non-matching", "-z", "--stdin"],
    `${relative}\0`,
    signal
  );
  if (result.code !== 0 && result.code !== 1) throw new Error("Git ignore inspection failed");
  const fields = result.stdout.split("\0");
  if (fields.length !== 5 || fields[4] !== "" || fields[3] !== relative)
    throw new Error("unexpected Git ignore response");
  const [source, line, pattern] = fields;
  if (!pattern || pattern.startsWith("!")) return undefined;
  if (!source || !line || !/^\d+$/.test(line)) throw new Error("unexpected Git ignore record");
  return {
    path: absolute,
    source: path.isAbsolute(source) ? source : path.join(root, source),
    line,
    pattern
  };
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
): Promise<IgnoreRecord | undefined> {
  signal.throwIfAborted();
  if (seen.has(absolute) || seen.size >= 32) throw new Error("symbolic link cycle or depth limit");
  seen.add(absolute);
  const link = await firstLink(absolute, signal);
  // Never send a descendant through a link to check-ignore: Git rejects it.
  const lexical = link ?? absolute;
  const info = await lstat(lexical);
  const directory = info.isDirectory() ? lexical : path.dirname(lexical);
  const root =
    workspace && contains(workspace, lexical)
      ? workspace
      : await repository(directory, signal, git);
  const record = await ignoredIn(root, lexical, signal, git);
  if (record) return record;
  if (!link) return undefined;
  const destination = path.resolve(
    path.dirname(link),
    await readlink(link),
    path.relative(link, absolute)
  );
  // A non-ignored link may point into an ignored scope of another repository.
  return inspect(destination, undefined, signal, git, seen);
}

/** One two-second deadline includes repository discovery and link traversal. */
export async function detectIgnored(
  absolute: string,
  cwd: string,
  signal?: AbortSignal,
  git: GitCommand = runGit
): Promise<Detection> {
  if (signal?.aborted) return { status: "cancelled" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const workspace = await repository(cwd, combined, git);
    // Validate final existence before considering lexical link parents. Missing
    // targets must not be blocked merely because an existing parent is ignored.
    await lstat(absolute);
    const record = await inspect(absolute, workspace, combined, git, new Set());
    combined.throwIfAborted();
    return record ? { status: "ignored", record } : { status: "allowed" };
  } catch (error) {
    if (signal?.aborted) return { status: "cancelled" };
    if (
      ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "") &&
      !String(error).includes("spawn")
    )
      return { status: "allowed" };
    const message = controller.signal.aborted
      ? "Git inspection timed out"
      : error instanceof Error
        ? error.message
        : "Git inspection failed";
    return { status: "unavailable", diagnostic: message.replace(/[\r\n]/g, " ").slice(0, 180) };
  } finally {
    clearTimeout(timeout);
  }
}
