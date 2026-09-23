import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vite-plus/test";

import { loadSkillConfig } from "./config.ts";

const directories: string[] = [];
const section = (expansionFormat: string) =>
  JSON.stringify({ "ext.pi-skills": { expansionFormat } });

function settings(global?: string, project?: string) {
  const root = mkdtempSync(join(tmpdir(), "pi-skills-config-"));
  directories.push(root);
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  mkdirSync(agentDir);
  mkdirSync(join(cwd, CONFIG_DIR_NAME), { recursive: true });
  const globalPath = join(agentDir, "settings.json");
  const projectPath = join(cwd, CONFIG_DIR_NAME, "settings.json");
  if (global !== undefined) writeFileSync(globalPath, global);
  if (project !== undefined) writeFileSync(projectPath, project);

  return { agentDir, cwd, globalPath, projectPath };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("defaults to Markdown links and reads only the extension section in global settings", () => {
  const { agentDir, cwd, globalPath } = settings();
  expect(loadSkillConfig(cwd, { agentDir })).toEqual({ expansionFormat: "[{command}]({path})" });

  const source = JSON.stringify({
    theme: "dark",
    "ext.pi-skills": { expansionFormat: " {command} ({path})" }
  });
  writeFileSync(globalPath, source);
  expect(loadSkillConfig(cwd, { agentDir })).toEqual({ expansionFormat: " {command} ({path})" });
  expect(readFileSync(globalPath, "utf8")).toBe(source);
});

it("uses trusted cwd settings over global settings, not untrusted or ancestor settings", () => {
  const { agentDir, cwd } = settings(
    section(" {command} ({path})"),
    section("Read {path} for {command}")
  );
  expect(loadSkillConfig(cwd, { agentDir })).toEqual({
    expansionFormat: " {command} ({path})"
  });
  expect(loadSkillConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
    expansionFormat: "Read {path} for {command}"
  });
  const child = join(cwd, "child");
  mkdirSync(child);
  expect(loadSkillConfig(child, { agentDir, projectTrusted: true })).toEqual({
    expansionFormat: " {command} ({path})"
  });
});

it.each([
  "{malformed",
  "null",
  "[]",
  JSON.stringify({ "ext.pi-skills": null }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: 2 } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "no placeholders" } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "{command}" } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "x".repeat(513) + "{path}" } }),
  JSON.stringify({ "ext.pi-skills": { expansionFormat: "{path}", unknown: true } })
])("ignores invalid project settings without losing the global format: %s", (source) => {
  const { agentDir, cwd } = settings(section("File: {path}"), source);
  expect(loadSkillConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
    expansionFormat: "File: {path}"
  });
});

it("bounds the whole settings file, including unrelated fields, before parsing", () => {
  const { agentDir, cwd } = settings(
    JSON.stringify({
      "ext.pi-skills": { expansionFormat: "{path}" },
      ignored: "x".repeat(1024 * 1024)
    })
  );
  expect(loadSkillConfig(cwd, { agentDir })).toEqual({ expansionFormat: "[{command}]({path})" });
});

it("uses the default when the settings file is unreadable", () => {
  const { agentDir, cwd, globalPath } = settings();
  mkdirSync(globalPath);
  expect(loadSkillConfig(cwd, { agentDir })).toEqual({ expansionFormat: "[{command}]({path})" });
});
