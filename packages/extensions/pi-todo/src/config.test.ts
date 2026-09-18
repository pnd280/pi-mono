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
    expect(loadTodoConfig(cwd, { agentDir })).toEqual({ widgetCollapsed: false });
    writeFileSync(global, JSON.stringify({ "ext.pi-todo": { widgetCollapsed: true } }));
    writeFileSync(project, JSON.stringify({ "ext.pi-todo": { widgetCollapsed: false, extra: 1 } }));
    expect(loadTodoConfig(cwd, { agentDir })).toEqual({ widgetCollapsed: true });
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
      widgetCollapsed: false
    });
    writeFileSync(project, JSON.stringify({ "ext.pi-todo": { widgetCollapsed: "bad" } }));
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true }).widgetCollapsed).toBe(true);
    writeFileSync(global, "broken JSON");
    expect(loadTodoConfig(cwd, { agentDir, projectTrusted: true })).toEqual({
      widgetCollapsed: false
    });
    writeFileSync(global, JSON.stringify({ ext: { "pi-todo": { widgetCollapsed: true } } }));
    expect(loadTodoConfig(cwd, { agentDir }).widgetCollapsed).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
