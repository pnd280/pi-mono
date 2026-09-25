import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createPiLaunch, createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { z } from "zod";

let directory: string;
let parent: string;
let id: string;

beforeEach(async () => {
  directory = await createValidationWorkspace("pi-session-utils-process-");
  const source = SessionManager.create(join(directory, "work"), join(directory, "parents"));
  parent = source.getSessionFile()!;
  id = source.getSessionId();
  await writeFile(parent, `${JSON.stringify(source.getHeader())}\n`);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function run(args: string[]) {
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
    timeout: 10_000
  });
  execution.child.stdin?.end();

  return execution;
}

async function childSessions() {
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

it("sets the parent before JSON output, preserves it across reload, and does not reapply it to a new child", async () => {
  const before = await readFile(parent, "utf8");
  const { stdout, stderr } = await run([
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
  const sessions = await childSessions();
  expect(sessions).toHaveLength(2);
  const firstChild = sessions.find((session) => session.parentSessionPath === parent)!;
  expect(firstChild).toBeDefined();
  expect(sessions.some((session) => session.parentSessionPath === firstChild.path)).toBe(true);
  expect(await readFile(parent, "utf8")).toBe(before);
}, 15_000);

it("allows an ephemeral child and retains its parent after /sesh persist", async () => {
  const { stdout, stderr } = await run([
    "--no-session",
    "--parent-session",
    parent,
    "/sesh persist",
    "/fixture-append"
  ]);
  expect(stderr).toBe("");
  const value: unknown = JSON.parse(stdout.split("\n")[0]!);
  expect(headerSchema.parse(value).parentSession).toBe(parent);
  const sessions = await childSessions();
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.parentSessionPath).toBe(parent);
}, 15_000);

it("does not write an ephemeral child unless explicitly persisted", async () => {
  const { stdout, stderr } = await run([
    "--no-session",
    "--parent-session",
    parent,
    "/fixture-append"
  ]);
  expect(stderr).toBe("");
  const value: unknown = JSON.parse(stdout.split("\n")[0]!);
  expect(headerSchema.parse(value).parentSession).toBe(parent);
  expect(await childSessions()).toEqual([]);
}, 15_000);

it("accepts an exact ID in an explicit session directory", async () => {
  const parentDir = SessionManager.open(parent).getSessionDir();
  const { stdout } = await run([
    "--session-dir",
    parentDir,
    "--parent-session",
    id,
    "/fixture-append"
  ]);
  const value: unknown = JSON.parse(stdout.split("\n")[0]!);
  expect(headerSchema.parse(value).parentSession).toBe(parent);
}, 15_000);

it.each(
  [
    ["--parent-session"],
    ["--parent-session", "missing.jsonl"],
    ["--parent-session", "missing-id"],
    ["--parent-session", "PARENT", "--continue"],
    ["--parent-session", "PARENT", "--session", "PARENT"],
    ["--parent-session", "PARENT", "--session-id", "new-id"]
  ].map((args) => ({ args }))
)(
  "fails startup instead of executing the prompt: $args",
  async ({ args }) => {
    const before = await readFile(parent, "utf8");
    await expect(
      run(args.map((arg) => (arg === "PARENT" ? parent : arg)).concat("/fixture-append"))
    ).rejects.toMatchObject({ code: 1 });
    expect(await readFile(parent, "utf8")).toBe(before);
    expect(await childSessions()).toEqual([]);
  },
  15_000
);
