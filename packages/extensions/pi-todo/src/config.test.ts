import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { loadTodoConfig } from "./config.ts";

it("merges only trusted cwd settings and rejects invalid sections without losing global defaults", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-todo-settings-"));
  const agentDir = join(root, "agent"),
    cwd = join(root, "project");
  mkdirSync(agentDir);
  mkdirSync(join(cwd, CONFIG_DIR_NAME), { recursive: true });
  const global = join(agentDir, "settings.json"),
    project = join(cwd, CONFIG_DIR_NAME, "settings.json");

  try {
    expect(loadTodoConfig(cwd, { agentDir })).toEqual({ collapseWidgetByDefault: false });
    writeFileSync(
      global,
      `\uFEFF${JSON.stringify({ "ext.pi-todo": { collapseWidgetByDefault: true } })}`
    );
    writeFileSync(
      project,
      `\uFEFF${JSON.stringify({ "ext.pi-todo": { collapseWidgetByDefault: false, extra: 1 } })}`
    );
    expect(loadTodoConfig(cwd, { agentDir })).toEqual({ collapseWidgetByDefault: true });
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
      collapseWidgetByDefault: false
    });
    writeFileSync(
      project,
      JSON.stringify({
        "ext.pi-todo": { collapseWidgetByDefault: false },
        unused: "x".repeat(1024 * 1024)
      })
    );
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
      collapseWidgetByDefault: true
    });
    writeFileSync(project, JSON.stringify({ "ext.pi-todo": { collapseWidgetByDefault: "bad" } }));
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true }).collapseWidgetByDefault).toBe(
      true
    );
    writeFileSync(global, "broken JSON");
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
      collapseWidgetByDefault: false
    });
    writeFileSync(
      global,
      JSON.stringify({ ext: { "pi-todo": { collapseWidgetByDefault: true } } })
    );
    expect(loadTodoConfig(cwd, { agentDir }).collapseWidgetByDefault).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
