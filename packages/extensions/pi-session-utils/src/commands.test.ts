import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  createEmptyChild,
  persistSession,
  registerSessionCommand,
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
    switchSession: vi.fn(async () => ({ cancelled: false })),
    newSession: vi.fn<SessionCommandContext["newSession"]>(),
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
  expect(new Set((await complete(""))?.map((item) => item.value))).toEqual(
    new Set(["persist", "create-empty-child", "auto-name"])
  );
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
  expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
  expect(notify.mock.calls[0]![0]).not.toContain("\x1b");
  expect(notify.mock.calls[0]![0]).not.toContain("\x07");
  expect(ctx.ui.notify).not.toHaveBeenCalled();
});

it("requires an ephemeral parent to be persisted explicitly", async () => {
  const ctx = context();
  await createEmptyChild(ctx);
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.switchSession).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("/sesh persist"), "error");
  expect(existsSync(join(directory, "agent", "sessions"))).toBe(false);
});

it("refuses a dangling parent link when Pi has allocated but not yet written a file", async () => {
  const ctx = context(SessionManager.create(cwd));
  await createEmptyChild(ctx);
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "error");
  expect(existsSync(ctx.sessionManager.getSessionFile()!)).toBe(false);
});
