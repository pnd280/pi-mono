import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { resolveParentSession } from "./parent.ts";
import { saveActiveBranch } from "./persist.ts";
import { applyStartupParent } from "./startup.ts";

let directory: string;
let cwd: string;
let parent: string;
let id: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pi-session-utils-parent-"));
  cwd = join(directory, "work");
  mkdirSync(cwd);
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "agent"));
  parent = saveActiveBranch(cwd, SessionManager.inMemory(cwd));
  id = SessionManager.open(parent).getSessionId();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it("resolves paths and exact IDs without reading or migrating conversation history", () => {
  const contents = readFileSync(parent, "utf8").replace('"version":3', '"version":1');
  writeFileSync(parent, `${contents}${"not parsed as conversation history".repeat(1000)}`);
  const before = readFileSync(parent, "utf8");
  expect(resolveParentSession(parent, cwd)).toBe(parent);
  expect(resolveParentSession(id, cwd)).toBe(parent);
  expect(readFileSync(parent, "utf8")).toBe(before);
  expect(() => resolveParentSession(id.slice(0, 8), cwd)).toThrow("not found");
});

it("accepts an exact custom ID that ends in .jsonl", () => {
  const header = SessionManager.open(parent).getHeader();
  writeFileSync(parent, `${JSON.stringify({ ...header, id: "named-session.jsonl" })}\n`);
  expect(resolveParentSession("named-session.jsonl", cwd)).toBe(parent);
});

it("rejects ambiguous IDs and deduplicates symlinks to the same parent", () => {
  const custom = join(directory, "custom");
  mkdirSync(custom);
  symlinkSync(parent, join(custom, "link.jsonl"));
  expect(resolveParentSession(id, cwd, custom)).toBe(parent);
  copyFileSync(parent, join(custom, "copy.jsonl"));
  expect(() => resolveParentSession(id, cwd, custom)).toThrow("Ambiguous");
  expect(resolveParentSession(parent, cwd, custom)).toBe(parent);
});

it("resolves a parent in a custom directory, without changing the child's cwd", () => {
  const custom = join(directory, "custom");
  mkdirSync(custom);
  const other = SessionManager.create(directory, custom);
  const otherPath = other.getSessionFile()!;
  writeFileSync(otherPath, `${JSON.stringify(other.getHeader())}\n`);
  const child = SessionManager.create(cwd, custom);
  applyStartupParent(child, parseArgs(["--parent-session", other.getSessionId()]));
  expect(child.getHeader()?.parentSession).toBe(otherPath);
  expect(child.getCwd()).toBe(cwd);
  expect(child.buildSessionContext().messages).toEqual([]);
});

it("links an ephemeral child and preserves the parent when the child is persisted", () => {
  const child = SessionManager.inMemory(cwd);
  applyStartupParent(child, parseArgs(["--no-session", "--parent-session", parent]));
  expect(child.getSessionFile()).toBeUndefined();
  expect(child.getHeader()?.parentSession).toBe(parent);
  const path = saveActiveBranch(cwd, child);
  expect(SessionManager.open(path).getHeader()?.parentSession).toBe(parent);
});

it.each(["--continue", "-c", "--resume", "-r", "--session", "--session-id", "--fork"])(
  "rejects conflicting %s without changing the selected session",
  (flag) => {
    const source = SessionManager.inMemory(cwd);
    const header = structuredClone(source.getHeader());
    expect(() =>
      applyStartupParent(source, parseArgs([flag, "value", "--parent-session", parent]))
    ).toThrow("cannot be combined");
    expect(source.getHeader()).toEqual(header);
  }
);

it("does not mistake a prompt or another option's value for a session-selection flag", () => {
  const child = SessionManager.inMemory(cwd);
  applyStartupParent(
    child,
    parseArgs(["--name", "--session", "--parent-session", parent, "--", "--continue"])
  );
  expect(child.getHeader()?.parentSession).toBe(parent);
});

it("refuses to reparent an existing or nonempty session", () => {
  const source = SessionManager.open(parent);
  const args = parseArgs(["--parent-session", parent]);
  expect(() => applyStartupParent(source, args)).toThrow("fresh session");
  const inMemory = SessionManager.inMemory(cwd);
  inMemory.appendMessage({ role: "user", content: "existing", timestamp: Date.now() });
  expect(() => applyStartupParent(inMemory, args)).toThrow("fresh session");
  expect(source.getHeader()?.parentSession).toBeUndefined();
  expect(inMemory.getHeader()?.parentSession).toBeUndefined();
});

it.each([undefined, "", "   "])("rejects a missing or empty parent: %s", (value) => {
  const args = ["--parent-session", ...(value === undefined ? [] : [value])];
  expect(() => applyStartupParent(SessionManager.inMemory(cwd), parseArgs(args))).toThrow(
    "requires a session file"
  );
});

it("rejects missing, malformed, oversized, and non-file parents without leaking contents", () => {
  const invalid = join(directory, "invalid.jsonl");

  for (const contents of [
    "private invalid content",
    JSON.stringify({ type: "session", secret: "private" }),
    JSON.stringify({ ...SessionManager.open(parent).getHeader(), extra: "x".repeat(1024 * 1024) })
  ]) {
    writeFileSync(invalid, contents);
    expect(() => resolveParentSession(invalid, cwd)).toThrow("existing, readable Pi session file");
  }

  expect(() => resolveParentSession(join(directory, "missing.jsonl"), cwd)).toThrow(
    "existing, readable"
  );
  expect(() => resolveParentSession(directory, cwd)).toThrow("existing, readable");
});
