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
  expect(() => resolveParentSession(id.slice(0, 8), cwd)).toThrow(Error);
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
  expect(() => resolveParentSession(id, cwd, custom)).toThrow(Error);
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

it("rejects missing, malformed, oversized, and non-file parents without leaking contents", () => {
  const invalid = join(directory, "invalid.jsonl");
  const secret = "private parent content";
  const excludesSecret: unknown = expect.not.stringContaining(secret);

  for (const contents of [
    secret,
    JSON.stringify({ type: "session", secret }),
    JSON.stringify({
      ...SessionManager.open(parent).getHeader(),
      secret,
      extra: "x".repeat(1024 * 1024)
    })
  ]) {
    writeFileSync(invalid, contents);
    expect(() => resolveParentSession(invalid, cwd)).toThrow(
      expect.objectContaining({ message: excludesSecret })
    );
  }

  expect(() => resolveParentSession(join(directory, "missing.jsonl"), cwd)).toThrow(Error);
  expect(() => resolveParentSession(directory, cwd)).toThrow(Error);
});
