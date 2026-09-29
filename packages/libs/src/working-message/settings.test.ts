import {
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { lockSync } from "proper-lockfile";
import { afterEach, expect, it } from "vite-plus/test";

import { WorkingMessageSettings } from "./settings.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(projectTrusted = true, agentName = "agent") {
  const root = mkdtempSync(join(tmpdir(), "working-message-settings-"));
  roots.push(root);
  const store = new WorkingMessageSettings({
    cwd: join(root, "project"),
    agentDir: join(root, agentName),
    projectTrusted
  });

  const write = (scope: "global" | "project", value: unknown) => {
    mkdirSync(dirname(store.paths[scope]), { recursive: true });
    writeFileSync(store.paths[scope], JSON.stringify(value));
  };

  return { store, write };
}

it("uses global defaults and replaces them with trusted project order, including an empty override", () => {
  const { store, write } = fixture();
  expect(store.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  write("global", { workingMessage: { order: ["b", "a", "b", "unavailable"] } });
  expect(store.load().global).toEqual(["b", "a", "unavailable"]);
  write("project", { workingMessage: { order: ["a"] } });
  expect(store.load().project).toEqual(["a"]);
  write("project", { workingMessage: { order: [] } });
  expect(store.load().project).toEqual([]);
});

it("distinguishes an unset global order from an explicit empty order", () => {
  const { store, write } = fixture();
  expect(store.load().global).toBeUndefined();
  write("global", { theme: "dark" });
  expect(store.load().global).toBeUndefined();
  write("global", { workingMessage: {} });
  expect(store.load().global).toBeUndefined();
  store.save("global", []);
  expect(store.load().global).toEqual([]);
});

it("merges saves with fresh settings without touching unrelated fields or the other scope", () => {
  const { store, write } = fixture();
  write("global", { theme: "dark", workingMessage: { order: ["unavailable", "a"], future: true } });
  store.load();
  write("global", {
    theme: "light",
    workingMessage: { ["__proto__"]: "kept", order: ["unavailable", "a"], future: true },
    nested: { preserved: 2 }
  });
  store.save("global", ["a", "unavailable"]);
  expect(JSON.parse(readFileSync(store.paths.global, "utf8"))).toEqual({
    theme: "light",
    workingMessage: { ["__proto__"]: "kept", order: ["a", "unavailable"], future: true },
    nested: { preserved: 2 }
  });
  const before = readFileSync(store.paths.global, "utf8");
  store.save("project", ["unavailable", "a"]);
  expect(readFileSync(store.paths.global, "utf8")).toBe(before);
  expect(store.load().project).toEqual(["unavailable", "a"]);
});

it("refuses oversized settings without overwriting unrelated fields", () => {
  const { store, write } = fixture();
  write("global", { workingMessage: { order: ["a"] }, unused: "x".repeat(1024 * 1024) });
  const before = readFileSync(store.paths.global);

  expect(store.load()).toMatchObject({ global: undefined, warnings: [expect.any(String)] });
  expect(() => store.save("global", ["b"])).toThrow("Check access");
  expect(readFileSync(store.paths.global)).toEqual(before);
});

it("does not save settings that would exceed the readable size after formatting", () => {
  const { store, write } = fixture();
  write("global", { unused: "x".repeat(1024 * 1024 - 64) });
  const before = readFileSync(store.paths.global);
  expect(before.byteLength).toBeLessThanOrEqual(1024 * 1024);

  expect(() => store.save("global", ["a"])).toThrow("Check access");
  expect(readFileSync(store.paths.global)).toEqual(before);
});

it("preserves settings symlinks and refuses to replace a dangling link", () => {
  const { store, write } = fixture();
  write("global", { theme: "dark" });
  const target = `${store.paths.global}.target`;
  writeFileSync(target, readFileSync(store.paths.global));
  rmSync(store.paths.global);
  symlinkSync(target, store.paths.global);
  store.save("global", ["a"]);
  expect(lstatSync(store.paths.global).isSymbolicLink()).toBe(true);
  expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
    theme: "dark",
    workingMessage: { order: ["a"] }
  });
  rmSync(target);
  expect(() => store.save("global", ["b"])).toThrow("Check access");
  expect(lstatSync(store.paths.global).isSymbolicLink()).toBe(true);
});

it("ignores untrusted local settings and refuses local writes", () => {
  const { store, write } = fixture(false);
  write("global", { workingMessage: { order: ["a"] } });
  write("project", { workingMessage: { order: ["b"] } });
  expect(store.load().project).toBeUndefined();
  expect(() => store.save("project", ["a"])).toThrow("Trust");
});

it("sanitizes diagnostic paths without changing settings destinations", () => {
  const { store, write } = fixture(true, "agent\x1b[2J\x07");
  const path = store.paths.global;
  write("global", { workingMessage: { order: 123 } });
  expect(store.load().warnings).toEqual([
    expect.stringContaining("agent/settings.json. Check access")
  ]);
  write("global", { workingMessage: null });
  expect(() => store.save("global", ["a"])).toThrow("File: " + path.replace("\x1b[2J\x07", ""));
  write("global", {});
  store.save("global", ["a"]);
  expect(store.paths.global).toBe(path);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ workingMessage: { order: ["a"] } });
});

it("replaces an invalid owned order while preserving unrelated fields", () => {
  const { store, write } = fixture();
  write("project", { theme: "dark", workingMessage: { order: 123, future: true } });
  expect(store.load().warnings).toHaveLength(1);
  store.save("project", ["b"]);
  expect(JSON.parse(readFileSync(store.paths.project, "utf8"))).toEqual({
    theme: "dark",
    workingMessage: { order: ["b"], future: true }
  });
  expect(store.load().warnings).toEqual([]);
});

it.each([null, [], "invalid"])("rejects a malformed section without repairing it", (section) => {
  const { store, write } = fixture();
  write("project", { workingMessage: section });
  const before = readFileSync(store.paths.project, "utf8");
  expect(store.load().warnings).toHaveLength(1);
  expect(() => store.save("project", ["b"])).toThrow("Check access");
  expect(readFileSync(store.paths.project, "utf8")).toBe(before);
});

it("reports malformed files and lock failures without overwriting the file", () => {
  const { store, write } = fixture();
  write("global", { workingMessage: { order: ["a"] } });
  write("project", {});
  const unlock = lockSync(store.paths.global, { realpath: false });

  try {
    expect(() => store.save("global", ["b"])).toThrow("lock");
    expect(store.load().global).toEqual(["a"]);
  } finally {
    unlock();
  }

  writeFileSync(store.paths.project, "{broken");
  expect(() => store.save("project", ["b"])).toThrow("Check access");
  expect(readFileSync(store.paths.project, "utf8")).toBe("{broken");
});
