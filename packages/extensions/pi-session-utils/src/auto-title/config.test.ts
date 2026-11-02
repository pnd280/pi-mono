import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vite-plus/test";

import { loadTitleConfig } from "./config.ts";

const directories: string[] = [];
const globalConfig = { model: "provider/global", thinkingLevel: "off" };
const globalSettings = titleSettings(globalConfig);

function titleSettings(config: unknown): string {
  return JSON.stringify({ "ext.pi-session-utils": { "auto-title": config } });
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function settings(global?: string, project?: string) {
  const root = mkdtempSync(join(tmpdir(), "pi-session-utils-auto-title-config-"));
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

// Zod and the settings-file library own other shapes; the e2e host covers unsupported levels.
it.each([
  undefined,
  titleSettings({ model: "provider/id" }),
  titleSettings({ thinkingLevel: "off" })
])("disables generation for missing, incomplete, or unsupported settings: %s", (source) => {
  const { agentDir, cwd } = settings(source);
  expect(loadTitleConfig(cwd, { agentDir })).toBeUndefined();
});

it("requires explicit trust before project settings can select a model or disable generation", () => {
  const { agentDir, cwd, projectPath } = settings(
    globalSettings,
    titleSettings({ model: "provider/project" })
  );
  expect(loadTitleConfig(cwd, { agentDir })).toEqual(globalConfig);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: false })).toEqual(globalConfig);
  writeFileSync(projectPath, "{malformed");
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: false })).toEqual(globalConfig);
});

it("allows the two required fields to be split across scopes but does not invent missing values", () => {
  const { agentDir, cwd, projectPath } = settings(
    titleSettings({ model: "provider/global" }),
    titleSettings({ thinkingLevel: "off" })
  );
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  writeFileSync(projectPath, "{}");
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toBeUndefined();
});

// Unreadable files and every schema failure share readSection (src/auto-title/config.ts).
it.each([
  "{malformed",
  JSON.stringify({ "ext.pi-session-utils": { "auto-title": globalConfig, unknown: true } }),
  titleSettings({ auto: true })
])("disables generation when either participating settings file is invalid: %s", (source) => {
  const { agentDir, cwd, globalPath, projectPath } = settings(globalSettings, source);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toBeUndefined();
  writeFileSync(globalPath, source);
  writeFileSync(projectPath, globalSettings);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toBeUndefined();
});

it("disables generation on project read errors rather than silently using another model", () => {
  const { agentDir, cwd, projectPath } = settings(globalSettings);
  mkdirSync(projectPath);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toBeUndefined();
});
