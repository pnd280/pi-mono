import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vite-plus/test";

import { loadExpansionFormat } from "./config.ts";

const directories: string[] = [];
const section = (expansionFormat: string) =>
  JSON.stringify({ "ext.pi-skills": { expansionFormat } });

function settings(global: string, project: string) {
  const root = mkdtempSync(join(tmpdir(), "pi-skills-config-"));
  directories.push(root);
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  mkdirSync(agentDir);
  mkdirSync(join(cwd, CONFIG_DIR_NAME), { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), global);
  writeFileSync(join(cwd, CONFIG_DIR_NAME, "settings.json"), project);

  return { agentDir, cwd };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("uses trusted cwd settings over global settings, not untrusted or ancestor settings", () => {
  const { agentDir, cwd } = settings(
    `\uFEFF${section(" {command} ({path})")}`,
    `\uFEFF${section("Read {path} for {command}")}`
  );
  expect(loadExpansionFormat(cwd, { agentDir })).toBe(" {command} ({path})");
  expect(loadExpansionFormat(cwd, { agentDir, projectTrusted: true })).toBe(
    "Read {path} for {command}"
  );
  const child = join(cwd, "child");
  mkdirSync(child);
  expect(loadExpansionFormat(child, { agentDir, projectTrusted: true })).toBe(
    " {command} ({path})"
  );
});

it.each([
  "{malformed",
  "null",
  JSON.stringify({ "ext.pi-skills": null }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: 2 } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "{path}", unknown: true } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "{command}" } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "x".repeat(513) + "{path}" } })
])("ignores invalid project settings without losing the global format: %s", (source) => {
  const { agentDir, cwd } = settings(section("File: {path}"), source);
  expect(loadExpansionFormat(cwd, { agentDir, projectTrusted: true })).toBe("File: {path}");
});

it("falls back when the project section has no format", () => {
  const { agentDir, cwd } = settings(
    section("File: {path}"),
    JSON.stringify({ "ext.pi-skills": {} })
  );
  expect(loadExpansionFormat(cwd, { agentDir, projectTrusted: true })).toBe("File: {path}");
});
