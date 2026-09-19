import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vite-plus/test";

import { loadTodoConfig } from "./config.ts";

it("merges only trusted cwd settings and rejects invalid sections without losing global defaults", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-todo-settings-"));
  const agentDir = join(root, "agent"),
    cwd = join(root, "project");
  mkdirSync(agentDir);
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  const global = join(agentDir, "settings.json"),
    project = join(cwd, ".pi", "settings.json");

  try {
    expect(loadTodoConfig(cwd, { agentDir })).toEqual({ collapseWidgetByDefault: false });
    writeFileSync(global, JSON.stringify({ "ext.pi-todo": { collapseWidgetByDefault: true } }));
    writeFileSync(
      project,
      JSON.stringify({ "ext.pi-todo": { collapseWidgetByDefault: false, extra: 1 } })
    );
    expect(loadTodoConfig(cwd, { agentDir })).toEqual({ collapseWidgetByDefault: true });
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
      collapseWidgetByDefault: false
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
