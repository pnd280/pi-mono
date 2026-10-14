import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vite-plus/test";

import { loadCompactConfig } from "./config.ts";

const directories: string[] = [];
const globalConfig = {
  model: "provider/global",
  thinkingLevel: "off",
  applyToManual: true,
  applyToAuto: true
};
const section = (config: unknown) => JSON.stringify({ "ext.pi-smart-compact": config });

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function settings(global?: string, project?: string) {
  const root = mkdtempSync(join(tmpdir(), "pi-smart-compact-config-"));
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

it.each([undefined, section({})])(
  "leaves native selection untouched when unconfigured: %s",
  (source) => {
    const { cwd, agentDir } = settings(source);
    expect(loadCompactConfig(cwd, { agentDir })).toEqual({});
  }
);

it("ignores untrusted project settings, including malformed files, and does not search ancestors", () => {
  const { cwd, agentDir, projectPath } = settings(
    section(globalConfig),
    section({ model: "other/id" })
  );
  expect(loadCompactConfig(cwd, { agentDir })).toEqual(globalConfig);
  writeFileSync(projectPath, "{malformed");
  expect(loadCompactConfig(cwd, { agentDir, projectTrusted: false })).toEqual(globalConfig);
  const child = join(cwd, "child");
  mkdirSync(child);
  expect(loadCompactConfig(child, { agentDir, projectTrusted: true })).toEqual(globalConfig);
});

it.each([
  "{malformed",
  "[]",
  section(null),
  section({ model: "model-only" }),
  section({ thinkingLevel: "automatic" }),
  section({ applyToManual: "true" }),
  section({ applyToAuto: null }),
  section({ instructionsFile: "   " }),
  section({ unknown: true }),
  JSON.stringify({ "ext.pi-smart-compact": globalConfig, ignored: "x".repeat(1024 * 1024) })
])("rejects invalid participating files rather than silently falling back: case %#", (source) => {
  const { cwd, agentDir, globalPath, projectPath } = settings(section(globalConfig), source);
  expect(() => loadCompactConfig(cwd, { agentDir, projectTrusted: true })).toThrow(
    /invalid or unreadable/
  );
  writeFileSync(globalPath, source);
  writeFileSync(projectPath, section(globalConfig));
  expect(() => loadCompactConfig(cwd, { agentDir, projectTrusted: true })).toThrow(
    /invalid or unreadable/
  );
});
