import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { loadTitleConfig } from "./config.ts";

const directories: string[] = [];
const globalConfig = { model: "provider/global", thinkingLevel: "off" };
const globalSettings = titleSettings(globalConfig);

function titleSettings(config: unknown): string {
  return JSON.stringify({ "ext.pi-session-utils": { "auto-title": config } });
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
  vi.unstubAllEnvs();
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

it("reads only the explicit auto-title section without changing global settings", () => {
  const source = JSON.stringify({
    theme: "light",
    defaultModel: "other-model",
    "ext.pi-session-utils": {
      "auto-title": { model: " provider/nested/model ", thinkingLevel: "low" }
    }
  });
  const { agentDir, cwd, globalPath } = settings(source);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  expect(loadTitleConfig(cwd)).toEqual({ model: "provider/nested/model", thinkingLevel: "low" });
  expect(readFileSync(globalPath, "utf8")).toBe(source);
});

it("accepts Pi-compatible BOM-prefixed global and trusted project settings", () => {
  const { cwd, agentDir } = settings(
    `\uFEFF${globalSettings}`,
    `\uFEFF${titleSettings({ model: "provider/project" })}`
  );
  expect(loadTitleConfig(cwd, { agentDir })).toEqual(globalConfig);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
    model: "provider/project",
    thinkingLevel: "off"
  });
});

it.each([
  undefined,
  "{}",
  JSON.stringify({ "ext.pi-session-utils": {} }),
  titleSettings({ model: "provider/id" }),
  titleSettings({ thinkingLevel: "off" }),
  titleSettings({ model: "provider/id", thinkingLevel: "automatic" })
])("disables generation for missing, incomplete, or unsupported settings: %s", (source) => {
  const { agentDir, cwd } = settings(source);
  expect(loadTitleConfig(cwd, { agentDir })).toBeUndefined();
});

it("rejects oversized settings before unknown top-level fields are discarded", () => {
  const source = JSON.stringify({
    "ext.pi-session-utils": { "auto-title": globalConfig },
    ignored: "x".repeat(1024 * 1024)
  });
  const { agentDir, cwd } = settings(source);
  expect(loadTitleConfig(cwd, { agentDir })).toBeUndefined();
});

it.each([
  {
    project: { model: " provider/project " },
    expected: { model: "provider/project", thinkingLevel: "off" }
  },
  {
    project: { thinkingLevel: "high" },
    expected: { model: "provider/global", thinkingLevel: "high" }
  }
])("merges trusted project fields over global settings: $project", ({ project, expected }) => {
  const source = titleSettings(project);
  const { agentDir, cwd, globalPath, projectPath } = settings(globalSettings, source);
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(expected);
  expect(readFileSync(globalPath, "utf8")).toBe(globalSettings);
  expect(readFileSync(projectPath, "utf8")).toBe(source);
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

it.each([undefined, "{}", JSON.stringify({ "ext.pi-session-utils": {} }), titleSettings({})])(
  "inherits global settings when the trusted project has no overrides: %s",
  (source) => {
    const { agentDir, cwd } = settings(globalSettings, source);
    expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  }
);

it.each([undefined, "{}", titleSettings({ thinkingLevel: "off" })])(
  "allows a complete project configuration without complete global settings: %s",
  (source) => {
    const { agentDir, cwd } = settings(source, globalSettings);
    expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  }
);

it("allows the two required fields to be split across scopes but does not invent missing values", () => {
  const { agentDir, cwd, projectPath } = settings(
    titleSettings({ model: "provider/global" }),
    titleSettings({ thinkingLevel: "off" })
  );
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toEqual(globalConfig);
  writeFileSync(projectPath, "{}");
  expect(loadTitleConfig(cwd, { agentDir, projectTrusted: true })).toBeUndefined();
});

it.each([
  "{malformed",
  "null",
  "[]",
  JSON.stringify({ "ext.pi-session-utils": null }),
  JSON.stringify({ "ext.pi-session-utils": [] }),
  JSON.stringify({ "ext.pi-session-utils": { title: globalConfig } }),
  JSON.stringify({ "ext.pi-session-utils": { "auto-title": globalConfig, unknown: true } }),
  titleSettings(null),
  titleSettings([]),
  titleSettings({ model: "model-only" }),
  titleSettings({ thinkingLevel: null }),
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

it("uses only the current directory's project settings, without ancestor discovery", () => {
  const { agentDir, cwd } = settings(globalSettings, titleSettings({ model: "provider/parent" }));
  const child = join(cwd, "child");
  mkdirSync(child);
  expect(loadTitleConfig(child, { agentDir, projectTrusted: true })).toEqual(globalConfig);
});
