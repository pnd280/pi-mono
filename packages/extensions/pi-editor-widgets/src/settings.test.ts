import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import { defaultLayout } from "./layout.ts";
import { WidgetSettings } from "./settings.ts";

let directory: string;
let settings: WidgetSettings;

const write = (path: string, content: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(content));
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pi-widget-settings-"));
  settings = new WidgetSettings({
    cwd: join(directory, "project"),
    agentDir: join(directory, "agent"),
    projectTrusted: true
  });
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it("uses whole-layout scope replacement, reads externally unset layouts separately from defaults, and preserves unrelated fields", () => {
  const global = defaultLayout();
  global.hidden = ["widget:global"];
  const project = defaultLayout();
  project.aboveEditor = [["widget:global"]];
  write(settings.paths.global, {
    theme: "dark",
    "ext.pi-editor-widgets": { ["__proto__"]: "kept", note: 42, layout: global }
  });
  settings.save("project", project);
  expect(settings.load()).toEqual({ global, project, warnings: [] });
  write(settings.paths.project, { "ext.pi-editor-widgets": { note: "externally unset" } });
  expect(settings.load()).toEqual({ global, project: undefined, warnings: [] });
  settings.save("project", defaultLayout());
  expect(settings.load().project).toEqual(defaultLayout());
  settings.save("global", project);
  expect(JSON.parse(readFileSync(settings.paths.global, "utf8"))).toMatchObject({
    theme: "dark",
    "ext.pi-editor-widgets": { ["__proto__"]: "kept", note: 42, layout: project }
  });
});

it("resolves contextThreshold per field, independently of the layout, and keeps it on save", () => {
  const layout = defaultLayout();
  write(settings.paths.global, { "ext.pi-editor-widgets": { contextThreshold: 150000 } });
  write(settings.paths.project, { "ext.pi-editor-widgets": { layout } });
  expect(settings.load()).toEqual({
    global: undefined,
    project: layout,
    contextThreshold: 150000,
    warnings: []
  });
  write(settings.paths.project, { "ext.pi-editor-widgets": { layout, contextThreshold: 90000 } });
  expect(settings.load().contextThreshold).toBe(90000);
  settings.save("project", layout);
  expect(JSON.parse(readFileSync(settings.paths.project, "utf8"))).toEqual({
    "ext.pi-editor-widgets": { layout, contextThreshold: 90000 }
  });
  write(settings.paths.project, { "ext.pi-editor-widgets": { contextThreshold: 90000 } });
  expect(settings.load()).toEqual({
    global: undefined,
    project: undefined,
    contextThreshold: 90000,
    warnings: []
  });
  const untrusted = new WidgetSettings({
    cwd: join(directory, "project"),
    agentDir: join(directory, "agent"),
    projectTrusted: false
  });
  expect(untrusted.load().contextThreshold).toBe(150000);
});

it.each([0, -1, 1.5, "150000", null])(
  "warns about invalid contextThreshold %j and falls back without dropping the layout",
  (contextThreshold) => {
    const layout = defaultLayout();
    write(settings.paths.global, { "ext.pi-editor-widgets": { contextThreshold: 150000 } });
    write(settings.paths.project, { "ext.pi-editor-widgets": { layout, contextThreshold } });
    const loaded = settings.load();
    expect(loaded.project).toEqual(layout);
    expect(loaded.contextThreshold).toBe(150000);
    expect(loaded.warnings).toEqual([expect.stringContaining("contextThreshold")]);
  }
);

it("falls back to window percentages when neither scope has a valid threshold", () => {
  const layout = defaultLayout();
  write(settings.paths.global, { "ext.pi-editor-widgets": { layout, contextThreshold: 0 } });
  write(settings.paths.project, { "ext.pi-editor-widgets": { contextThreshold: null } });
  expect(settings.load()).toEqual({
    global: layout,
    project: undefined,
    warnings: [
      expect.stringContaining("contextThreshold"),
      expect.stringContaining("contextThreshold")
    ]
  });
});

it("ignores untrusted project files and ancestors, and refuses project writes", () => {
  const untrusted = new WidgetSettings({
    cwd: join(directory, "project"),
    agentDir: join(directory, "agent"),
    projectTrusted: false
  });
  write(settings.paths.project, { "ext.pi-editor-widgets": { layout: defaultLayout() } });
  write(join(directory, ".pi/settings.json"), {
    "ext.pi-editor-widgets": { layout: defaultLayout() }
  });
  expect(untrusted.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  expect(() => untrusted.save("project", defaultLayout())).toThrow("Trust this project");
  rmSync(settings.paths.project);
  expect(settings.load().project).toBeUndefined();
});

it("falls back for invalid layouts, retaining unknown IDs and an independently valid threshold", () => {
  const global = defaultLayout();
  global.hidden = ["widget:not-installed"];
  settings.save("global", global);
  write(settings.paths.project, {
    "ext.pi-editor-widgets": {
      layout: { ...global, hidden: ["builtin:cwd"] },
      contextThreshold: 90000
    }
  });
  const loaded = settings.load();
  expect(loaded.global).toEqual(global);
  expect(loaded.project).toBeUndefined();
  expect(loaded.contextThreshold).toBe(90000);
  expect(loaded.warnings).toHaveLength(1);
  settings.save("project", defaultLayout());
  expect(settings.load().project).toEqual(defaultLayout());
});

it.each([null, [], "invalid"])(
  "rejects malformed extension sections without silently repairing them",
  (section) => {
    write(settings.paths.global, { "ext.pi-editor-widgets": section });
    expect(settings.load().warnings).toHaveLength(1);
    const before = readFileSync(settings.paths.global, "utf8");
    expect(() => settings.save("global", defaultLayout())).toThrow("Check access");
    expect(readFileSync(settings.paths.global, "utf8")).toBe(before);
  }
);

it.each(["{broken", "null", "[]"])("never overwrites malformed settings", (source) => {
  mkdirSync(dirname(settings.paths.global), { recursive: true });
  writeFileSync(settings.paths.global, source);
  expect(settings.load().warnings).toHaveLength(1);
  expect(() => settings.save("global", defaultLayout())).toThrow("Check access");
  expect(readFileSync(settings.paths.global, "utf8")).toBe(source);
});

it("does not write on load and respects a held Pi settings lock", () => {
  expect(settings.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  expect(() => readFileSync(settings.paths.global)).toThrow();
  settings.save("global", defaultLayout());
  const before = readFileSync(settings.paths.global, "utf8");
  mkdirSync(`${settings.paths.global}.lock`);
  const changed = defaultLayout();
  changed.hidden = ["widget:locked"];
  expect(() => settings.save("global", changed)).toThrow("lock");
  expect(readFileSync(settings.paths.global, "utf8")).toBe(before);
});
