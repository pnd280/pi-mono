import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, vi } from "vite-plus/test";

import editorWidgets from "../src/index.ts";
import { defaultLayout } from "../src/layout.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

it("/widgets accepts no arguments and saves the global draft selected in the menu, not the project override", async () => {
  const fixture = await hostFixture([editorWidgets]);
  const globalPath = join(fixture.agentDir, "settings.json");
  mkdirSync(fixture.agentDir, { recursive: true });
  mkdirSync(join(fixture.directory, ".pi"));
  const project = defaultLayout();
  project.aboveEditor = [["widget:project"]];
  writeFileSync(
    join(fixture.directory, ".pi/settings.json"),
    JSON.stringify({ "ext.pi-editor-widgets": { layout: project } })
  );
  let opening: Promise<void> | undefined;

  try {
    await fixture.bind();
    const runner = fixture.session.extensionRunner;
    const command = runner.getCommand("widgets");
    expect(command).toBeDefined();
    expect(command?.getArgumentCompletions).toBeUndefined();
    const ctx = runner.createCommandContext();
    const notify = vi.spyOn(ctx.ui, "notify");
    const editor = fixture.host.editorContainer.children[0];

    for (const args of ["global", "project", "invalid"]) {
      await command?.handler(args, ctx);
      expect(notify).toHaveBeenLastCalledWith("Usage: /widgets", "error");
      expect(fixture.host.editorContainer.children[0]).toBe(editor);
    }

    opening = command?.handler("", ctx);
    await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor));
    const menu = fixture.host.editorContainer.children[0]!;
    expect(plain(menu.render(100))).toContain(
      `Settings: ${join(fixture.directory, ".pi/settings.json")}`
    );
    menu.handleInput?.("\t");
    expect(plain(menu.render(100))).toContain(`Settings: ${globalPath}`);
    expect(plain(menu.render(80))).toContain("Scope: global (not set) | project");
    menu.handleInput?.("\x13");
    expect(plain(menu.render(80))).toContain("Project layout applies on close.");
    expect(plain(menu.render(80))).not.toContain("global (not set)");
    const saved: unknown = JSON.parse(readFileSync(globalPath, "utf8"));
    expect(saved).toMatchObject({ "ext.pi-editor-widgets": { layout: { aboveEditor: [] } } });
    menu.handleInput?.("\x03");
    await opening;
    expect(fixture.host.editorContainer.children[0]).toBe(editor);
  } finally {
    fixture.host.editorContainer.children[0]?.handleInput?.("\x03");
    await fixture.dispose();
    await opening;
  }
});

it("/widgets refreshes the context threshold without saving and restores percentage colors when removed", async () => {
  const fixture = await hostFixture([editorWidgets]);
  const { session, host, ui } = fixture;
  const path = join(fixture.agentDir, "settings.json");
  mkdirSync(fixture.agentDir, { recursive: true });
  writeFileSync(path, JSON.stringify({ "ext.pi-editor-widgets": { contextThreshold: 1500 } }));
  const usage = vi.spyOn(session, "getContextUsage").mockReturnValue({
    tokens: 750,
    contextWindow: 1000,
    percent: 75
  });
  let opening: Promise<void> | undefined;

  try {
    session.setAutoCompactionEnabled(false);
    await fixture.bind();
    const footer = () => host.customFooter?.render(80).join("\n");
    expect(footer()).toContain(ui.theme.fg("success", "750/1.0k (75.0%)"));
    const runner = session.extensionRunner;
    const ctx = runner.createCommandContext();
    const notify = vi.spyOn(ctx.ui, "notify");
    const editor = host.editorContainer.children[0];

    for (const [contextThreshold, color] of [
      [300, "error"],
      [undefined, "warning"]
    ] as const) {
      const source = JSON.stringify({ "ext.pi-editor-widgets": { contextThreshold } });
      writeFileSync(path, source);
      opening = runner.getCommand("widgets")?.handler("", ctx);
      await vi.waitFor(() => expect(host.editorContainer.children[0]).not.toBe(editor));
      expect(footer()).toContain(ui.theme.fg(color, "750/1.0k (75.0%)"));
      host.editorContainer.children[0]?.handleInput?.("\x03");
      await opening;
      expect(footer()).toContain(ui.theme.fg(color, "750/1.0k (75.0%)"));
      expect(readFileSync(path, "utf8")).toBe(source);
    }

    expect(notify).not.toHaveBeenCalled();
  } finally {
    host.editorContainer.children[0]?.handleInput?.("\x03");
    await opening;
    usage.mockRestore();
    await fixture.dispose();
  }
});

it.each(["regular", "fullscreen"] as const)(
  "restores the live layout when a mounted %s menu is cancelled by the host",
  async (mode) => {
    const fixture = await hostFixture([editorWidgets], mode);
    const abort = new AbortController();
    let opening: Promise<void> | undefined;

    try {
      await fixture.bind();
      fixture.ui.setWidget("live", () => ({ render: () => ["LIVE WIDGET"], invalidate() {} }));
      const runner = fixture.session.extensionRunner;
      const editor = fixture.host.editorContainer.children[0];
      opening = runner.getCommand("widgets")?.handler("", {
        ...runner.createCommandContext(),
        signal: abort.signal
      });
      await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor));
      const menu = fixture.host.editorContainer.children[0]!;
      menu.handleInput?.("\r");
      menu.handleInput?.("\r");
      menu.handleInput?.("\x1b[3~");

      for (const [width, height] of [
        [80, 24],
        [40, 10]
      ] as const) {
        fixture.terminal.columns = width;
        fixture.terminal.rows = height;
        fixture.host.ui.requestRender();
        const lines = fixture.host.renderer.render(width);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        expect(plain(lines)).toContain("Empty row");
        expect(plain(lines)).not.toContain("LIVE WIDGET");
      }

      abort.abort();
      await opening;
      expect(fixture.host.editorContainer.children[0]).toBe(editor);
      expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("LIVE WIDGET");
      expect(() => readFileSync(`${fixture.agentDir}/settings.json`)).toThrow();
    } finally {
      abort.abort();
      await opening;
      await fixture.dispose();
    }
  }
);

it("/widgets exposes load warnings and distinguishes a successful save with another invalid scope", async () => {
  const fixture = await hostFixture([editorWidgets]);
  mkdirSync(fixture.agentDir, { recursive: true });
  mkdirSync(join(fixture.directory, ".pi"));
  writeFileSync(join(fixture.agentDir, "settings.json"), "{broken");
  let opening: Promise<void> | undefined;

  try {
    await fixture.bind();
    const runner = fixture.session.extensionRunner;
    const editor = fixture.host.editorContainer.children[0];
    const ctx = runner.createCommandContext();
    opening = runner.getCommand("widgets")?.handler("", ctx);
    await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor));
    const menu = fixture.host.editorContainer.children[0];
    expect(plain(menu?.render(100) ?? [])).toContain(
      `Settings: ${join(fixture.agentDir, "settings.json")}`
    );
    menu?.handleInput?.("\t");
    expect(plain(menu?.render(100) ?? [])).toContain("Settings warning.");
    const notify = vi.spyOn(ctx.ui, "notify");
    menu?.handleInput?.("\x13");
    expect(plain(menu?.render(100) ?? [])).toContain("Saved and applied.");
    expect(plain(menu?.render(100) ?? [])).toContain("Settings warning.");
    expect(plain(menu?.render(100) ?? [])).not.toContain("Save failed");
    expect(notify).not.toHaveBeenCalled();
    expect(readFileSync(join(fixture.agentDir, "settings.json"), "utf8")).toBe("{broken");
    menu?.handleInput?.("\x03");
    await opening;
  } finally {
    fixture.host.editorContainer.children[0]?.handleInput?.("\x03");
    await fixture.dispose();
    await opening;
  }
});
