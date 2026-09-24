import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { persistSession } from "./commands.ts";
import { saveActiveBranch } from "./persist.ts";

let directory: string;
let cwd: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pi-session-utils-"));
  cwd = join(directory, "work");
  mkdirSync(cwd);
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "agent"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function user(text: string) {
  return { role: "user" as const, content: text, timestamp: Date.now() };
}

function userContent(manager: SessionManager) {
  return manager
    .buildSessionContext()
    .messages.flatMap((message) => (message.role === "user" ? [message.content] : []));
}

it("saves the active branch with a new header, preserving entries and context", () => {
  const source = SessionManager.inMemory(cwd);
  const rootId = source.appendMessage(user("original"));
  source.appendCustomEntry("fixture", { active: true });
  source.appendMessage(user("abandoned"));
  source.branch(rootId);
  source.appendMessage(user("selected"));
  source.appendSessionInfo("Saved conversation");

  const path = saveActiveBranch(cwd, source);
  const saved = SessionManager.open(path);
  const lines = readFileSync(path, "utf8").trim().split("\n");

  expect(saved.isPersisted()).toBe(true);
  expect(saved.getSessionId()).not.toBe(source.getSessionId());
  expect(saved.getHeader()?.id).toBe(saved.getSessionId());
  expect(saved.getHeader()?.cwd).toBe(cwd);
  expect(lines).toHaveLength(source.getBranch().length + 1);
  expect(saved.getEntries()).toEqual(source.getBranch());
  expect(saved.getSessionName()).toBe("Saved conversation");
  expect(saved.buildSessionContext().messages).toEqual(source.buildSessionContext().messages);
  expect(userContent(saved)).toEqual(["original", "selected"]);

  saved.appendMessage(user("continued"));
  expect(SessionManager.open(path).getBranch().at(-1)).toEqual(saved.getBranch().at(-1));
  expect(source.getSessionFile()).toBeUndefined();
});

it.each(["Renamed session", ""])(
  "preserves the current session-wide name after navigating away from its metadata: %s",
  (name) => {
    const source = SessionManager.inMemory(cwd);
    source.appendSessionInfo("Old title");
    const selected = source.appendMessage(user("selected"));
    source.appendMessage(user("abandoned"));
    source.appendSessionInfo(name);
    source.branch(selected);
    const branch = source.getBranch();
    const entries = source.getEntries();

    const saved = SessionManager.open(saveActiveBranch(cwd, source));

    expect(saved.getSessionName()).toBe(name || undefined);
    expect(saved.getEntries().slice(0, branch.length)).toEqual(branch);
    expect(saved.getBranch().at(-1)?.parentId).toBe(selected);
    expect(userContent(saved)).toEqual(["selected"]);
    expect(source.getEntries()).toEqual(entries);
    expect(source.getBranch()).toEqual(branch);
  }
);

it("preserves the current name when saving an empty active branch", () => {
  const source = SessionManager.inMemory(cwd);
  source.appendSessionInfo("Named session");
  source.resetLeaf();

  const saved = SessionManager.open(saveActiveBranch(cwd, source));

  expect(saved.getSessionName()).toBe("Named session");
  expect(saved.getBranch().at(-1)?.parentId).toBeNull();
  expect(saved.buildSessionContext().messages).toEqual([]);
  expect(source.getBranch()).toEqual([]);
});

it("saves immediately while idle and switches to the file-backed branch", async () => {
  const source = SessionManager.inMemory(cwd);
  source.appendMessage(user("before"));
  let saved: SessionManager | undefined;
  const isIdle = vi.fn(() => true);
  const switchSession = vi.fn(async (path: string) => {
    saved = SessionManager.open(path);
    expect(userContent(saved)).toEqual(["before"]);

    return { cancelled: false };
  });
  const notify = vi.fn();

  await persistSession({
    cwd,
    sessionManager: source,
    isIdle,
    switchSession,
    ui: { notify }
  });

  expect(isIdle).toHaveBeenCalledOnce();
  expect(switchSession).toHaveBeenCalledOnce();
  expect(saved?.isPersisted()).toBe(true);
  expect(source.getSessionFile()).toBeUndefined();
  expect(notify).not.toHaveBeenCalled();
});

it("leaves already file-backed sessions unchanged", async () => {
  const isIdle = vi.fn(() => true);
  const switchSession = vi.fn(async () => ({ cancelled: false }));
  const notify = vi.fn();

  await persistSession({
    cwd,
    sessionManager: SessionManager.create(cwd),
    isIdle,
    switchSession,
    ui: { notify }
  });

  expect(isIdle).toHaveBeenCalledOnce();
  expect(switchSession).not.toHaveBeenCalled();
  expect(notify).toHaveBeenCalledOnce();
});

it("removes the new file when the switch is cancelled", async () => {
  const source = SessionManager.inMemory(cwd);
  source.appendMessage(user("keep in memory"));
  let path: string | undefined;
  const switchSession = vi.fn(async (sessionPath: string) => {
    path = sessionPath;
    expect(existsSync(sessionPath)).toBe(true);

    return { cancelled: true };
  });
  const notify = vi.fn();

  await persistSession({
    cwd,
    sessionManager: source,
    isIdle: () => true,
    switchSession,
    ui: { notify }
  });

  expect(path).toBeDefined();
  expect(existsSync(path!)).toBe(false);
  expect(source.getBranch()).toHaveLength(1);
  expect(notify).toHaveBeenCalledWith("Session switch cancelled; no file saved", "info");
});

it("keeps the saved file for recovery when switching fails", async () => {
  const source = SessionManager.inMemory(cwd);
  source.appendMessage(user("recoverable"));
  let path: string | undefined;

  await expect(
    persistSession({
      cwd,
      sessionManager: source,
      isIdle: () => true,
      switchSession: async (sessionPath) => {
        path = sessionPath;
        throw new Error("switch failed");
      },
      ui: { notify: vi.fn() }
    })
  ).rejects.toThrow("switch failed");

  expect(path).toBeDefined();
  expect(SessionManager.open(path!).buildSessionContext().messages).toEqual(
    source.buildSessionContext().messages
  );
});
