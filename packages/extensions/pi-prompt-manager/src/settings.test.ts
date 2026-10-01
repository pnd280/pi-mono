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
  expect(result.warnings.length).toBeGreaterThan(0);
});

it.each([
  {
    name: "uses defaults without warning when global settings are absent",
    content: undefined,
    historyRetention: 250,
    warns: false
  },
  {
    name: "reads settings with the UTF-8 BOM accepted by Pi",
    content: `\uFEFF${JSON.stringify({ "ext.pi-prompt-manager": { historyRetention: 12 } })}`,
    historyRetention: 12,
    warns: false
  },
  {
    name: "treats an empty global settings file as Pi's absent settings",
    content: "",
    historyRetention: 250,
    warns: false
  },
  {
    name: "warns safely and uses defaults when global settings contain malformed JSON",
    content: '{"private prompt"',
    historyRetention: 250,
    warns: true
  },
  {
    name: "rejects oversized global settings instead of reading them without a bound",
    content: JSON.stringify({
      "ext.pi-prompt-manager": { historyRetention: 12 },
      padding: "x".repeat(1024 * 1024)
    }),
    historyRetention: 250,
    warns: true
  }
])("$name", async ({ content, historyRetention, warns }) => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-prompt-settings-"));

  try {
    if (content !== undefined) await writeFile(join(agentDir, "settings.json"), content);
    const result = await loadSettings(agentDir);
    expect(result.settings).toEqual({
      historyRetention,
      shortcuts: { history: ["ctrl+r"], saveDraft: ["ctrl+shift+s"] }
    });
    if (warns)
      expect(result.warnings).toEqual([
        "Global settings could not be read; using prompt-manager defaults."
      ]);
    else expect(result.warnings).toEqual([]);
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
  expect(warnings.length).toBeGreaterThan(0);
  expect(
    parseSettings({ shortcuts: { history: ["ctrl+x", "bogus"] } }).settings.shortcuts.history
  ).toEqual(["ctrl+r"]);
  const unsupported = parseSettings({ shortcuts: { history: ["+"], saveDraft: ["ctrl+x"] } });
  expect(unsupported.settings.shortcuts).toEqual({ history: ["ctrl+r"], saveDraft: ["ctrl+x"] });
  expect(unsupported.warnings).toEqual([
    "Invalid launch shortcut list; using that action's default."
  ]);
});
