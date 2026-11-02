import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vite-plus/test";

import { loadCompactConfig, selectRule } from "./config.ts";

const directories: string[] = [];
const globalRule = { model: "provider/global", thinkingLevel: "off" };
const globalConfig = {
  rules: [{ match: "^provider/", ...globalRule }],
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

it("selects the first matching rule as a unit, and a bare rule keeps native selection", () => {
  const { cwd, agentDir } = settings(
    section({
      rules: [
        { match: "^other/", model: "missing/model" },
        { match: "/main$" },
        { match: "", model: "provider/summary", thinkingLevel: "low" }
      ]
    })
  );
  const config = loadCompactConfig(cwd, { agentDir });
  expect(selectRule(config, { provider: "provider", id: "main" })).toEqual({
    match: new RegExp("/main$")
  });
  expect(selectRule(config, { provider: "provider", id: "nested/id" })).toEqual({
    match: new RegExp(""),
    model: "provider/summary",
    thinkingLevel: "low"
  });
  expect(selectRule({}, { provider: "provider", id: "main" })).toBeUndefined();
});

// Unreadable and malformed files are covered end to end; the settings library owns their parsing.
it.each([
  section(null),
  section({ model: "provider/id" }),
  section({ rules: [{ model: "provider/id" }] }),
  section({ rules: [{ match: "(" }] }),
  section({ rules: [{ match: "", model: "model-only" }] }),
  section({ rules: [{ match: "", thinkingLevel: "automatic" }] }),
  section({ applyToManual: "true" }),
  section({ applyToAuto: null }),
  section({ compactionInstructionsFile: "   " }),
  section({ unknown: true })
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
