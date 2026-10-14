import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { createEmptyChild, type SessionCommandContext } from "./commands.ts";

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

it("refuses a dangling parent link when Pi has allocated but not yet written a file", async () => {
  const ctx = {
    cwd,
    sessionManager: SessionManager.create(cwd),
    isIdle: () => true,
    switchSession: vi.fn<SessionCommandContext["switchSession"]>(),
    newSession: vi.fn<SessionCommandContext["newSession"]>(),
    ui: { notify: vi.fn<SessionCommandContext["ui"]["notify"]>() }
  };
  await createEmptyChild(ctx);
  expect(ctx.newSession).not.toHaveBeenCalled();
  expect(ctx.ui.notify).toHaveBeenCalledWith(expect.any(String), "error");
  expect(existsSync(ctx.sessionManager.getSessionFile()!)).toBe(false);
});
