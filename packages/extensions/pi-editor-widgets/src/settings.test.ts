import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import { defaultLayout } from "./layout.ts";
import { widgetSettings, type WidgetSettings } from "./settings.ts";

let directory: string;
let settings: WidgetSettings;

const write = (path: string, content: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(content));
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pi-widget-settings-"));
  settings = widgetSettings({
    cwd: join(directory, "project"),
    agentDir: join(directory, "agent"),
    projectTrusted: true
  });
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("uses whole-layout scope replacement and reads externally unset layouts separately from defaults", () => {
  const global = defaultLayout();
  global.hidden = ["widget:global"];
  const project = defaultLayout();
  project.aboveEditor = [["widget:global"]];
  write(settings.paths.global, { "ext.pi-editor-widgets": { layout: global } });
  settings.save("project", project);
  expect(settings.load()).toEqual({ global, project, warnings: [] });
  write(settings.paths.project, { "ext.pi-editor-widgets": { note: "externally unset" } });
  expect(settings.load()).toEqual({ global, project: undefined, warnings: [] });
  settings.save("global", project);
  expect(JSON.parse(readFileSync(settings.paths.global, "utf8"))).toEqual({
    "ext.pi-editor-widgets": { layout: project }
  });
});

it("falls back for invalid layouts, retaining unknown IDs, and refuses to save them", () => {
  const global = defaultLayout();
  global.hidden = ["widget:not-installed"];
  settings.save("global", global);
  const invalid = { ...global, hidden: ["builtin:cwd"] };
  write(settings.paths.project, { "ext.pi-editor-widgets": { layout: invalid } });
  const loaded = settings.load();
  expect(loaded.global).toEqual(global);
  expect(loaded.project).toBeUndefined();
  expect(loaded.warnings).toEqual([expect.stringContaining("pi-editor-widgets: cannot load")]);
  expect(() => settings.save("project", invalid)).toThrow("Cannot save this layout");
  settings.save("project", defaultLayout());
  expect(settings.load().project).toEqual(defaultLayout());
});
