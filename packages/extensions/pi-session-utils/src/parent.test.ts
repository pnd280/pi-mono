import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { resolveParentSession } from "./parent.ts";
import { saveActiveBranch } from "./persist.ts";

let directory: string;
let cwd: string;
let parent: string;
let id: string;

beforeEach(() => {
  // Lookup returns real paths; on macOS the temporary directory is below the /var symlink.
  directory = realpathSync(mkdtempSync(join(tmpdir(), "pi-session-utils-parent-")));
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

// Creating symlinks on Windows needs Developer Mode or administrator rights.
it.skipIf(process.platform === "win32")(
  "rejects ambiguous IDs and deduplicates symlinks to the same parent",
  () => {
    const custom = join(directory, "custom");
    mkdirSync(custom);
    symlinkSync(parent, join(custom, "link.jsonl"));
    expect(resolveParentSession(id, cwd, custom)).toBe(parent);
    copyFileSync(parent, join(custom, "copy.jsonl"));
    expect(() => resolveParentSession(id, cwd, custom)).toThrow(Error);
    expect(resolveParentSession(parent, cwd, custom)).toBe(parent);
  }
);

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
