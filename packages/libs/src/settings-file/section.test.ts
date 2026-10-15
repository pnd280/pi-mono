import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { lockSync } from "proper-lockfile";
import { afterEach, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { SettingsScope } from "./scopes.ts";
import { settingsSection } from "./section.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(projectTrusted = true, agentName = "agent") {
  const root = mkdtempSync(join(tmpdir(), "pi-settings-section-"));
  roots.push(root);
  const section = settingsSection({
    cwd: join(root, "project"),
    agentDir: join(root, agentName),
    projectTrusted,
    key: "ext.test",
    field: "order",
    schema: z.array(z.string()).max(2),
    invalidValue: "Invalid order.",
    loadWarning: (path) => `Cannot load ${path}.`
  });

  const write = (scope: SettingsScope, value: unknown) => {
    mkdirSync(dirname(section.paths[scope]), { recursive: true });
    writeFileSync(section.paths[scope], JSON.stringify(value));
  };

  return { root, section, write };
}

it("ignores untrusted project settings and parent directories, and refuses project writes", () => {
  const untrusted = fixture(false);
  untrusted.write("project", { "ext.test": { order: ["project"] } });
  const before = readFileSync(untrusted.section.paths.project, "utf8");
  expect(untrusted.section.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  expect(() => untrusted.section.save("project", ["a"])).toThrow("Trust this project");
  expect(readFileSync(untrusted.section.paths.project, "utf8")).toBe(before);

  const { root, section } = fixture();
  mkdirSync(join(root, ".pi"));
  writeFileSync(join(root, ".pi/settings.json"), JSON.stringify({ "ext.test": { order: ["a"] } }));
  expect(section.load().project).toBeUndefined();
});

it("replaces only the owned field in fresh settings, leaving unrelated fields and the other scope untouched", () => {
  const { section, write } = fixture();
  write("global", { theme: "dark", "ext.test": { order: ["a"] } });
  section.load();
  // An invalid old value is replaced; the rest of the section survives.
  write("global", {
    theme: "light",
    "ext.test": { ["__proto__"]: "kept", order: 123, future: true },
    nested: { preserved: 2 }
  });
  section.save("global", ["b"]);
  expect(JSON.parse(readFileSync(section.paths.global, "utf8"))).toEqual({
    theme: "light",
    "ext.test": { ["__proto__"]: "kept", order: ["b"], future: true },
    nested: { preserved: 2 }
  });
  const before = readFileSync(section.paths.global, "utf8");
  section.save("project", ["c"]);
  expect(readFileSync(section.paths.global, "utf8")).toBe(before);
  expect(section.load()).toEqual({ global: ["b"], project: ["c"], warnings: [] });
});

it.each([null, [], "invalid"])("warns about a %j section and refuses to repair it", (malformed) => {
  const { section, write } = fixture();
  write("global", { "ext.test": malformed });
  expect(section.load().warnings).toHaveLength(1);
  const before = readFileSync(section.paths.global, "utf8");
  expect(() => section.save("global", ["a"])).toThrow("Check access");
  expect(readFileSync(section.paths.global, "utf8")).toBe(before);
});

it("writes nothing on load or invalid saves, and reports lock and file failures without overwriting", () => {
  const { section, write } = fixture();
  expect(section.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  expect(() => section.save("global", ["a", "b", "c"])).toThrow("Invalid order.");
  expect(() => readFileSync(section.paths.global)).toThrow();

  write("global", { "ext.test": { order: ["a"] } });
  const unlock = lockSync(section.paths.global, { realpath: false });

  try {
    expect(() => section.save("global", ["b"])).toThrow("locks");
    expect(section.load().global).toEqual(["a"]);
  } finally {
    unlock();
  }

  mkdirSync(dirname(section.paths.project), { recursive: true });
  writeFileSync(section.paths.project, "{broken");
  expect(section.load().warnings).toHaveLength(1);
  expect(() => section.save("project", ["b"])).toThrow("Check access");
  expect(readFileSync(section.paths.project, "utf8")).toBe("{broken");
});

it("sanitises diagnostic paths without changing settings destinations", () => {
  const { section, write } = fixture(true, "agent\x1b[2J\x07");
  const path = section.paths.global;
  write("global", { "ext.test": { order: 123 } });
  expect(section.load().warnings).toEqual([expect.stringContaining("agent/settings.json.")]);
  write("global", { "ext.test": null });
  expect(() => section.save("global", ["a"])).toThrow("File: " + path.replace("\x1b[2J\x07", ""));
  write("global", {});
  section.save("global", ["a"]);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ "ext.test": { order: ["a"] } });
});
