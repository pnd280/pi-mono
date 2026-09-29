import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { loadSettings, parseSettings } from "./settings.ts";

it("validates fields independently, floors/clamps finite numbers without coercion", () => {
  for (const [value, expected] of [
    [undefined, 250],
    ["8", 250],
    [Infinity, 250],
    [NaN, 250],
    [8.9, 8],
    [-10, 1],
    [9000, 5000]
  ]) {
    expect(parseSettings({ historyRetention: value }).settings.historyRetention).toBe(expected);
  }

  const result = parseSettings({
    historyRetention: 3,
    extra: true,
    shortcuts: { history: [], saveDraft: [null] }
  });
  expect(result.settings).toEqual({
    historyRetention: 3,
    shortcuts: { history: [], saveDraft: ["ctrl+shift+s"] }
  });
  expect(result.warnings).toHaveLength(2);
});

it.each([
  {
    name: "reads settings with the UTF-8 BOM accepted by Pi",
    content: `\uFEFF${JSON.stringify({ "ext.pi-prompt-manager": { historyRetention: 12 } })}`,
    historyRetention: 12,
    warnings: []
  },
  {
    name: "treats an empty global settings file as Pi's absent settings",
    content: "",
    historyRetention: 250,
    warnings: []
  },
  {
    name: "rejects oversized global settings instead of reading them without a bound",
    content: JSON.stringify({
      "ext.pi-prompt-manager": { historyRetention: 12 },
      padding: "x".repeat(1024 * 1024)
    }),
    historyRetention: 250,
    warnings: ["Global settings could not be read; using prompt-manager defaults."]
  }
])("$name", async ({ content, historyRetention, warnings }) => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-prompt-settings-"));

  try {
    await writeFile(join(agentDir, "settings.json"), content);
    expect(await loadSettings(agentDir)).toEqual({
      settings: {
        historyRetention,
        shortcuts: { history: ["ctrl+r"], saveDraft: ["ctrl+shift+s"] }
      },
      warnings
    });
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
});

it("canonicalizes aliases/modifier order and gives History collision ownership", () => {
  const { settings, warnings } = parseSettings({
    shortcuts: {
      history: ["SHIFT+ctrl+S", "ctrl+shift+s", "esc"],
      saveDraft: ["ctrl+shift+s", "escape", "ctrl+x"]
    }
  });
  expect(settings.shortcuts).toEqual({
    history: ["ctrl+shift+s", "escape"],
    saveDraft: ["ctrl+x"]
  });
  expect(warnings).toHaveLength(2);
  expect(
    parseSettings({ shortcuts: { history: ["ctrl+x", "bogus"] } }).settings.shortcuts.history
  ).toEqual(["ctrl+r"]);
});
