import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  createEmptyChild,
  persistSession,
  registerSessionCommand,
  runSessionOperation,
  type SessionCommandContext
} from "./commands.ts";
import { saveActiveBranch } from "./persist.ts";

type SessionSwitchOptions = NonNullable<Parameters<SessionCommandContext["switchSession"]>[1]>;

type ReplacementContext = Parameters<NonNullable<SessionSwitchOptions["withSession"]>>[0];

let directory: string;
let cwd: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pi-session-utils-command-"));
  cwd = join(directory, "work");
  mkdirSync(cwd);
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "agent"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function context(sessionManager = SessionManager.inMemory(cwd)) {
  return {
    cwd,
    sessionManager,
    isIdle: vi.fn(() => true),
    waitForIdle: vi.fn(async () => {}),
    switchSession: vi.fn(async () => ({ cancelled: false })),
    newSession: vi.fn(async () => ({ cancelled: true })),
    ui: { notify: vi.fn<SessionCommandContext["ui"]["notify"]>() }
  };
}

it("registers only /sesh and completes only its supported subcommands", async () => {
  const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
  registerSessionCommand(
    {
      registerCommand: (name, options) => {
        commands.set(name, options);
      }
    },
    vi.fn(async () => {})
  );
  expect([...commands.keys()]).toEqual(["sesh"]);
  const complete = commands.get("sesh")!.getArgumentCompletions!;
  expect((await complete(""))?.map((item) => item.value)).toEqual([
    "persist",
    "create-empty-child",
    "auto-name"
  ]);
  expect((await complete("create-"))?.map((item) => item.value)).toEqual(["create-empty-child"]);
  expect((await complete("auto-"))?.map((item) => item.value)).toEqual(["auto-name"]);
  expect((await complete("auto-name "))?.map((item) => item.value)).toEqual(["auto-name clear"]);
  expect((await complete("auto-name cl"))?.map((item) => item.value)).toEqual(["auto-name clear"]);
  expect(await complete("auto-name")).toBeNull();
  expect(await complete("auto-name clear")).toBeNull();
  expect(await complete("auto-name unknown")).toBeNull();
  expect(await complete("persist")).toBeNull();
  expect(await complete("create-sub-session")).toBeNull();
});

it("rejects unknown subcommands and extra arguments before any session operations", async () => {
  const ctx = context();

  for (const args of [
    "",
    "unknown",
    "persist extra",
    "create-empty-child extra",
    "create-sub-session"
  ]) {
    await runSessionOperation(args, ctx);
  }

  expect(ctx.waitForIdle).not.toHaveBeenCalled();
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.switchSession).not.toHaveBeenCalled();
});

it.each(["persist", "create-empty-child"])(
  "%s warns and returns immediately while busy without saving or switching",
  async (command) => {
    const ctx = context();
    ctx.isIdle.mockReturnValue(false);
    await runSessionOperation(command, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/agent is running/i),
      "warning"
    );
    expect(ctx.waitForIdle).not.toHaveBeenCalled();
    expect(ctx.newSession).not.toHaveBeenCalled();
    expect(ctx.switchSession).not.toHaveBeenCalled();
    expect(existsSync(join(directory, "agent", "sessions"))).toBe(false);

    if (command === "create-empty-child") {
      const [message] = ctx.ui.notify.mock.calls[0]!;
      expect(message).toContain("/sesh persist");
      expect(message).not.toContain("--parent-session");
    }
  }
);

it("warns when persist is busy even if the session is already file-backed", async () => {
  const ctx = context(SessionManager.create(cwd));
  ctx.isIdle.mockReturnValue(false);
  await runSessionOperation("persist", ctx);

  expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/agent is running/i),
    "warning"
  );
  expect(ctx.waitForIdle).not.toHaveBeenCalled();
  expect(ctx.switchSession).not.toHaveBeenCalled();
});

it("includes a shell-safe linked CLI command for a busy persisted parent", async () => {
  const saved = saveActiveBranch(cwd, SessionManager.inMemory(cwd));
  const parent = join(
    directory,
    "parent's $(printf injected) `printf substituted` ; $HOME [*].jsonl"
  );
  renameSync(saved, parent);
  const before = readFileSync(parent, "utf8");
  const ctx = context(SessionManager.open(parent));
  ctx.isIdle.mockReturnValue(false);
  await runSessionOperation("create-empty-child", ctx);

  expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/agent is running/i),
    "warning"
  );
  const [message] = ctx.ui.notify.mock.calls[0]!;
  const command = message.split("\n").find((line) => line.startsWith("pi --parent-session "));
  expect(command).toBeDefined();
  // Capture shell arguments without launching Pi or making a provider request.
  const argumentsOutput = execFileSync(
    "bash",
    ["--noprofile", "--norc", "-c", `pi() { printf '%s\\0' "$@"; }\n${command}`],
    { cwd: directory, encoding: "utf8", env: { PATH: process.env.PATH } }
  );
  expect(argumentsOutput).toBe(`--parent-session\0${parent}\0`);
  expect(ctx.waitForIdle).not.toHaveBeenCalled();
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.switchSession).not.toHaveBeenCalled();
  expect(readFileSync(parent, "utf8")).toBe(before);
});

it.each(["\x1b[2J\x07", "\t", "\n", "\r"])(
  "keeps control-bearing parent paths out of copyable CLI guidance: %j",
  async (control) => {
    const saved = saveActiveBranch(cwd, SessionManager.inMemory(cwd));
    const parent = join(directory, `parent${control}.jsonl`);
    renameSync(saved, parent);
    const ctx = context(SessionManager.open(parent));
    ctx.isIdle.mockReturnValue(false);
    await createEmptyChild(ctx);
    const [message] = ctx.ui.notify.mock.calls[0]!;
    expect(message).not.toContain("\x1b");
    expect(message).not.toContain("\x07");
    expect(message).not.toContain("--parent-session");
    expect(message).toContain("/sesh create-empty-child");
    expect(ctx.newSession).not.toHaveBeenCalled();
    expect(ctx.sessionManager.getSessionFile()).toBe(parent);
  }
);

it("sanitizes saved-path notifications without changing the switched path", async () => {
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "agent\x1b[2J\x07"));
  const ctx = context();
  const notify = vi.fn<SessionCommandContext["ui"]["notify"]>();
  const replacement = { ui: { notify } };

  const switchSession: SessionCommandContext["switchSession"] = async (path, options) => {
    expect(path).toContain("agent\x1b[2J\x07");
    expect(existsSync(path)).toBe(true);
    // The post-switch callback only consumes the replacement UI's notify capability.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await options?.withSession?.(replacement as unknown as ReplacementContext);

    return { cancelled: false };
  };

  await persistSession({ ...ctx, switchSession });
  expect(notify).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("agent/sessions/"),
    "info"
  );
  expect(notify.mock.calls[0]![0]).not.toContain("\x1b");
  expect(notify.mock.calls[0]![0]).not.toContain("\x07");
  expect(ctx.ui.notify).not.toHaveBeenCalled();
});

it("warns without a dangling CLI command when a busy parent's file is not yet written", async () => {
  const ctx = context(SessionManager.create(cwd));
  ctx.isIdle.mockReturnValue(false);
  await runSessionOperation("create-empty-child", ctx);

  expect(ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("not been saved"),
    "warning"
  );
  const [message] = ctx.ui.notify.mock.calls[0]!;
  expect(message).not.toContain("--parent-session");
  expect(existsSync(ctx.sessionManager.getSessionFile()!)).toBe(false);
  expect(ctx.waitForIdle).not.toHaveBeenCalled();
  expect(ctx.newSession).not.toHaveBeenCalled();
});

it("requires an ephemeral parent to be persisted explicitly", async () => {
  const ctx = context();
  await createEmptyChild(ctx);
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.switchSession).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(
    "Run /sesh persist before creating a sub-session",
    "error"
  );
});

it("refuses a dangling parent link when Pi has allocated but not yet written a file", async () => {
  const ctx = context(SessionManager.create(cwd));
  await createEmptyChild(ctx);
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("not been saved"), "error");
});

it("requests an empty child with a parent path and preserves cancellation", async () => {
  const path = saveActiveBranch(cwd, SessionManager.inMemory(cwd));
  const ctx = context(SessionManager.open(path));
  await createEmptyChild(ctx);
  expect(ctx.isIdle).toHaveBeenCalledOnce();
  expect(ctx.waitForIdle).not.toHaveBeenCalled();
  expect(ctx.newSession).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ parentSession: path })
  );
  expect(ctx.ui.notify).toHaveBeenCalledWith("Sub-session creation cancelled", "info");
  expect(ctx.sessionManager.getSessionFile()).toBe(path);
});
