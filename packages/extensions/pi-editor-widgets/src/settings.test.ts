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

it("uses whole-layout scope replacement, restores inheritance separately from defaults, and preserves unrelated fields", () => {
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
  settings.save("project", undefined);
  expect(settings.load().project).toBeUndefined();
  settings.save("project", defaultLayout());
  expect(settings.load().project).toEqual(defaultLayout());
  settings.save("global", project);
  expect(JSON.parse(readFileSync(settings.paths.global, "utf8"))).toMatchObject({
    theme: "dark",
    "ext.pi-editor-widgets": { ["__proto__"]: "kept", note: 42, layout: project }
  });
});

it("ignores untrusted project files and ancestors, and refuses project writes", () => {
  const untrusted = new WidgetSettings({ ...settings.options, projectTrusted: false });
  write(settings.paths.project, { "ext.pi-editor-widgets": { layout: defaultLayout() } });
  write(join(directory, ".pi/settings.json"), {
    "ext.pi-editor-widgets": { layout: defaultLayout() }
  });
  expect(untrusted.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  expect(() => untrusted.save("project", defaultLayout())).toThrow("Trust this project");
  rmSync(settings.paths.project);
  expect(settings.load().project).toBeUndefined();
});

it("warns and falls back for invalid layouts, retaining unknown IDs in valid layouts", () => {
  const global = defaultLayout();
  global.hidden = ["widget:not-installed"];
  settings.save("global", global);
  write(settings.paths.project, {
    "ext.pi-editor-widgets": { layout: { ...global, hidden: ["builtin:cwd"] } }
  });
  const loaded = settings.load();
  expect(loaded.global).toEqual(global);
  expect(loaded.project).toBeUndefined();
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

it.each(["{broken", "null", "[]", " ".repeat(1024 * 1024 + 1)])(
  "never overwrites malformed or oversized settings",
  (source) => {
    mkdirSync(dirname(settings.paths.global), { recursive: true });
    writeFileSync(settings.paths.global, source);
    expect(settings.load().warnings).toHaveLength(1);
    expect(() => settings.save("global", defaultLayout())).toThrow("Check access");
    expect(readFileSync(settings.paths.global, "utf8")).toBe(source);
  }
);

it("does not write on load and respects a held Pi settings lock", () => {
  expect(settings.load()).toEqual({ global: undefined, project: undefined, warnings: [] });
  expect(() => readFileSync(settings.paths.global)).toThrow();
  settings.save("global", defaultLayout());
  const before = readFileSync(settings.paths.global, "utf8");
  mkdirSync(`${settings.paths.global}.lock`);
  expect(() => settings.save("global", undefined)).toThrow("lock");
  expect(readFileSync(settings.paths.global, "utf8")).toBe(before);
});
