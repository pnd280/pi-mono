import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { loadTitleConfig } from "./config.ts";

const directories: string[] = [];
const globalConfig = { model: "provider/global", thinkingLevel: "off" };
const globalSettings = JSON.stringify({ "ext.pi-session-title": globalConfig });

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function settings(global?: string, project?: string) {
  const root = mkdtempSync(join(tmpdir(), "pi-session-title-config-"));
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

it("reads only the explicit section without changing global settings", () => {
  const source = JSON.stringify({
    theme: "light",
    defaultModel: "other-model",
    "ext.pi-session-title": { model: " provider/nested/model ", thinkingLevel: "low" }
  });
  const { agentDir, cwd, globalPath } = settings(source);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_SESSION_TITLE_MODEL", "ignored/model");
  expect(loadTitleConfig(cwd)).toEqual({ model: "provider/nested/model", thinkingLevel: "low" });
  expect(readFileSync(globalPath, "utf8")).toBe(source);
});

it.each([
  undefined,
  "{malformed",
  "null",
  "[]",
  "{}",
  JSON.stringify({ "ext.pi-session-title": null }),
  JSON.stringify({ "ext.pi-session-title": { model: "provider/id" } }),
  JSON.stringify({ "ext.pi-session-title": { thinkingLevel: "off" } }),
  JSON.stringify({ "ext.pi-session-title": { model: "model-only", thinkingLevel: "off" } }),
  JSON.stringify({ "ext.pi-session-title": { model: "provider/id", thinkingLevel: null } }),
  JSON.stringify({ "ext.pi-session-title": { model: "provider/id", thinkingLevel: "automatic" } }),
  JSON.stringify({
    "ext.pi-session-title": { model: "provider/id", thinkingLevel: "off", auto: true }
  })
])("disables generation for missing, malformed, incomplete, or unknown settings: %s", (source) => {
  const { agentDir, cwd } = settings(source);
  expect(loadTitleConfig(cwd, { agentDir })).toBeUndefined();
});

it("rejects oversized settings before unknown top-level fields are discarded", () => {
  const source = JSON.stringify({
    "ext.pi-session-title": globalConfig,
    ignored: "x".repeat(1024 * 1024)
  });
  const { agentDir, cwd } = settings(source);
  expect(loadTitleConfig(cwd, { agentDir })).toBeUndefined();
});

it.each([
  { model: " provider/project " },
  { thinkingLevel: "high" },
  { model: "provider/project", thinkingLevel: "low" }
])("merges trusted project fields over global settings: %j", (project) => {
  const source = JSON.stringify({ theme: "dark", "ext.pi-session-title": project });
  const { agentDir, cwd, globalPath, projectPath } = settings(globalSettings, source);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
    ...globalConfig,
    ...project,
    model: project.model?.trim() ?? globalConfig.model
  });
  expect(readFileSync(globalPath, "utf8")).toBe(globalSettings);
  expect(readFileSync(projectPath, "utf8")).toBe(source);
});

it("requires explicit trust before project settings can select a model or disable generation", () => {
  const { agentDir, cwd, projectPath } = settings(
    globalSettings,
    JSON.stringify({ "ext.pi-session-title": { model: "provider/project" } })
  );
  expect(loadTitleConfig(cwd, { agentDir })).toEqual(globalConfig);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: false })).toEqual(globalConfig);
  writeFileSync(projectPath, "{malformed");
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: false })).toEqual(globalConfig);
});

it.each([undefined, "{}", JSON.stringify({ "ext.pi-session-title": {} })])(
  "inherits global settings when the trusted project has no overrides: %s",
  (source) => {
    const { agentDir, cwd } = settings(globalSettings, source);
    expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  }
);

it.each([undefined, "{}", JSON.stringify({ "ext.pi-session-title": { thinkingLevel: "off" } })])(
  "allows a complete project configuration without complete global settings: %s",
  (source) => {
    const { agentDir, cwd } = settings(source, globalSettings);
    expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  }
);

it("allows the two required fields to be split across scopes but does not invent missing values", () => {
  const { agentDir, cwd, projectPath } = settings(
    JSON.stringify({ "ext.pi-session-title": { model: "provider/global" } }),
    JSON.stringify({ "ext.pi-session-title": { thinkingLevel: "off" } })
  );
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  writeFileSync(projectPath, "{}");
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toBeUndefined();
});

it.each([
  "{malformed",
  "null",
  "[]",
  JSON.stringify({ "ext.pi-session-title": null }),
  JSON.stringify({ "ext.pi-session-title": { model: "model-only" } }),
  JSON.stringify({ "ext.pi-session-title": { thinkingLevel: null } }),
  JSON.stringify({ "ext.pi-session-title": { auto: true } })
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

it("uses only the current directory's project settings, without ancestor discovery", () => {
  const { agentDir, cwd } = settings(
    globalSettings,
    JSON.stringify({ "ext.pi-session-title": { model: "provider/parent" } })
  );
  const child = join(cwd, "child");
  mkdirSync(child);
  expect(loadTitleConfig(child, { agentDir, projectTrusted: true })).toEqual(globalConfig);
});
