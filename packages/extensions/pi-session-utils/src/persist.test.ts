import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  source.appendMessage(user("abandoned"));
  source.branch(rootId);
  source.appendCustomEntry("fixture", { active: true });
  source.appendMessage(user("selected"));
  source.appendSessionInfo("Saved conversation");
  const branch = structuredClone(source.getBranch());
  const entries = structuredClone(source.getEntries());

  const saved = SessionManager.open(saveActiveBranch(cwd, source));

  expect(saved.isPersisted()).toBe(true);
  expect(saved.getSessionId()).not.toBe(source.getSessionId());
  expect(saved.getHeader()?.cwd).toBe(cwd);
  expect(saved.getEntries()).toEqual(branch);
  expect(saved.getSessionName()).toBe("Saved conversation");
  expect(userContent(saved)).toEqual(["original", "selected"]);
  expect(source.getEntries()).toEqual(entries);
  expect(source.getBranch()).toEqual(branch);
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
    const branch = structuredClone(source.getBranch());
    const entries = structuredClone(source.getEntries());

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

it("leaves already file-backed sessions unchanged", async () => {
  const original = SessionManager.inMemory(cwd);
  original.appendMessage(user("already saved"));
  const path = saveActiveBranch(cwd, original);
  const source = SessionManager.open(path);
  const contents = readFileSync(path, "utf8");
  const files = new Set(readdirSync(source.getSessionDir()));
  const switchSession = vi.fn(async () => ({ cancelled: false }));

  await persistSession({
    cwd,
    sessionManager: source,
    isIdle: () => true,
    switchSession,
    ui: { notify: vi.fn() }
  });

  expect(switchSession).not.toHaveBeenCalled();
  expect(source.getSessionFile()).toBe(path);
  expect(readFileSync(path, "utf8")).toBe(contents);
  expect(new Set(readdirSync(source.getSessionDir()))).toEqual(files);
});

it("removes the new file when the switch is cancelled", async () => {
  const source = SessionManager.inMemory(cwd);
  source.appendMessage(user("keep in memory"));
  const existingPath = saveActiveBranch(cwd, source);
  const existingContents = readFileSync(existingPath, "utf8");
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
  expect(readFileSync(existingPath, "utf8")).toBe(existingContents);
  expect(userContent(source)).toEqual(["keep in memory"]);
  expect(notify).toHaveBeenCalledWith(expect.any(String), "info");
});

it.each(["before", "after"])(
  "keeps the saved file for recovery when switching fails %s replacement",
  async (stage) => {
    const source = SessionManager.inMemory(cwd);
    source.appendMessage(user("recoverable"));
    let current = source;
    let path: string | undefined;

    await expect(
      persistSession({
        cwd,
        get sessionManager() {
          return current;
        },
        isIdle: () => true,
        switchSession: async (sessionPath) => {
          path = sessionPath;
          if (stage === "after") current = SessionManager.open(sessionPath);
          throw new Error("switch failed");
        },
        ui: { notify: vi.fn() }
      })
    ).rejects.toThrow("switch failed");

    expect(current.getSessionFile()).toBe(stage === "after" ? path : undefined);
    expect(path).toBeDefined();
    expect(SessionManager.open(path!).buildSessionContext().messages).toEqual([
      expect.objectContaining({ role: "user", content: "recoverable" })
    ]);
  }
);
