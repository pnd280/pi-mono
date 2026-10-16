import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createPiLaunch,
  createValidationWorkspace,
  STEP_TIMEOUT_MS
} from "@pi-mono/libs/validation/pi-process";
import { it, type TestContext } from "vite-plus/test";
import { z } from "zod";

/** Each test owns its workspace and process, so the CLI launches can overlap. */
async function createWorkspace({ onTestFinished }: TestContext) {
  const directory = await createValidationWorkspace("pi-session-utils-process-");
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const source = SessionManager.create(join(directory, "work"), join(directory, "parents"));
  const file = source.getSessionFile()!;
  await writeFile(file, `${JSON.stringify(source.getHeader())}\n`);

  // Lookup records the real path; on macOS the temporary directory is below the /var symlink.
  return { directory, parent: await realpath(file) };
}

async function run(directory: string, args: string[]) {
  const launch = await createPiLaunch({
    directory,
    args: [
      "--no-extensions",
      "--no-skills",
      "--no-themes",
      "--no-prompt-templates",
      "--no-context-files",
      "--no-tools",
      "-e",
      fileURLToPath(new URL("../index.ts", import.meta.url)),
      "-e",
      fileURLToPath(new URL("./fixture.ts", import.meta.url)),
      "--print",
      "--mode",
      "json",
      ...args
    ]
  });
  const execution = promisify(execFile)(launch.command, launch.args, {
    ...launch.options,
    timeout: STEP_TIMEOUT_MS
  });
  execution.child.stdin?.end();

  return execution;
}

async function childSessions(directory: string) {
  const root = join(directory, "agent", "sessions");
  if (!existsSync(root)) return [];
  const groups = await readdir(root);

  return (
    await Promise.all(groups.map((group) => SessionManager.listAll(join(root, group))))
  ).flat();
}

const headerSchema = z.object({
  type: z.literal("session"),
  parentSession: z.string(),
  cwd: z.string()
});

it.concurrent("sets the parent before JSON output, preserves it across reload, and does not reapply it to a new child", async (context) => {
  const { expect } = context;
  const { directory, parent } = await createWorkspace(context);
  const before = await readFile(parent, "utf8");
  const { stdout, stderr } = await run(directory, [
    "--parent-session",
    parent,
    "/fixture-append",
    "/fixture-reload",
    "/sesh create-empty-child",
    "/fixture-append"
  ]);
  expect(stderr).toBe("");
  const value: unknown = JSON.parse(stdout.split("\n")[0]!);
  expect(headerSchema.parse(value).parentSession).toBe(parent);
  const sessions = await childSessions(directory);
  expect(sessions).toHaveLength(2);
  const firstChild = sessions.find((session) => session.parentSessionPath === parent)!;
  expect(firstChild).toBeDefined();
  expect(sessions.some((session) => session.parentSessionPath === firstChild.path)).toBe(true);
  expect(await readFile(parent, "utf8")).toBe(before);
});

it.concurrent("allows an ephemeral child and retains its parent after /sesh persist", async (context) => {
  const { expect } = context;
  const { directory, parent } = await createWorkspace(context);
  const { stdout, stderr } = await run(directory, [
    "--no-session",
    "--parent-session",
    parent,
    "/sesh persist",
    "/fixture-append"
  ]);
  expect(stderr).toBe("");
  const value: unknown = JSON.parse(stdout.split("\n")[0]!);
  expect(headerSchema.parse(value).parentSession).toBe(parent);
  const sessions = await childSessions(directory);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.parentSessionPath).toBe(parent);
});

it.concurrent.for(
  [
    ["--parent-session"],
    ["--parent-session", "missing.jsonl"],
    ["--parent-session", "PARENT", "--continue"],
    ["--parent-session", "PARENT", "--session", "PARENT"],
    ["--parent-session", "PARENT", "--session-id", "new-id"]
  ].map((args) => ({ args }))
)("fails startup instead of executing the prompt: $args", async ({ args }, context) => {
  const { expect } = context;
  const { directory, parent } = await createWorkspace(context);
  const before = await readFile(parent, "utf8");
  await expect(
    run(directory, args.map((arg) => (arg === "PARENT" ? parent : arg)).concat("/fixture-append"))
  ).rejects.toMatchObject({ code: 1 });
  expect(await readFile(parent, "utf8")).toBe(before);
  expect(await childSessions(directory)).toEqual([]);
});
