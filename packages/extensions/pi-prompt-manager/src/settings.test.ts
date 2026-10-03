import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { loadSettings } from "./settings.ts";

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
