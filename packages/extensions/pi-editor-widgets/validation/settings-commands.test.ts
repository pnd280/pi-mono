import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";

import editorWidgets from "../src/index.ts";
import { defaultLayout } from "../src/layout.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

it("toggles a fullscreen usage widget on click without writing settings", async () => {
  const fixture = await hostFixture([editorWidgets], "fullscreen");
  const { session, host } = fixture;
  const usage = vi.spyOn(session, "getContextUsage").mockReturnValue({
    tokens: 75000,
    contextWindow: 200000,
    percent: 37.5
  });
  const compact = "75k/200k (auto)";
  const verbose = "75k/200k (37.5%) (auto ~150k)";
  const path = join(fixture.agentDir, "settings.json");
  mkdirSync(fixture.agentDir, { recursive: true });
  const source = JSON.stringify({ "ext.pi-editor-widgets": { layout: defaultLayout() } });
  writeFileSync(path, source);
  session.settingsManager.applyOverrides({ compaction: { enabled: true, reserveTokens: 50000 } });

  try {
    await fixture.bind();
    const footer = () => plain(host.footerContainer.render(100));

    const click = (text: string) => {
      const lines = host.footerContainer.render(100).map(stripTerminalSequences);
      const y = lines.findIndex((line) => line.includes(text));
      expect(y).toBeGreaterThanOrEqual(0);
      const x = lines[y]!.indexOf(text);

      return host.footerContainer.handleMouse({
        type: "click",
        button: "left",
        x,
        y,
        screenX: x,
        screenY: y,
        width: 100,
        height: lines.length,
        shift: false,
        alt: false,
        ctrl: false
      });
    };

    expect(click(compact)).toMatchObject({ handled: true });
    expect(footer()).toContain(verbose);
    expect(click(verbose)).toMatchObject({ handled: true });
    expect(footer()).toContain(compact);
    host.resetExtensionUI();
    await session.reload();
    expect(readFileSync(path, "utf8")).toBe(source);
  } finally {
    usage.mockRestore();
    await fixture.dispose();
  }
});

it.each(["regular", "fullscreen"] as const)(
  "/widgets in %s saves the selected global draft and restores the project override on close",
  async (mode) => {
    const fixture = await hostFixture([editorWidgets], mode);
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
      fixture.ui.setWidget("project", ["PROJECT WIDGET"], { placement: "belowEditor" });
      expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("PROJECT WIDGET");
      const runner = fixture.session.extensionRunner;
      const command = runner.getCommand("widgets");
      expect(command).toBeDefined();
      const ctx = runner.createCommandContext();
      const notify = vi.spyOn(ctx.ui, "notify");
      const editor = fixture.host.editorContainer.children[0];

      for (const args of ["context", "tokens", "global", "project", "invalid"]) {
        await command?.handler(args, ctx);
        expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("/widgets"), "error");
        expect(fixture.host.editorContainer.children[0]).toBe(editor);
      }

      opening = command?.handler("", ctx);
      await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor), {
        interval: 1,
        timeout: STEP_TIMEOUT_MS
      });
      const menu = fixture.host.editorContainer.children[0]!;
      expect(plain(menu.render(100))).toContain(
        `Settings: ${join(fixture.directory, ".pi/settings.json")}`
      );
      menu.handleInput?.("\t");
      expect(plain(menu.render(100))).toContain(`Settings: ${globalPath}`);
      menu.handleInput?.("\x13");
      expect(plain(menu.render(80))).toContain("Project layout applies on close");
      expect(plain(menu.render(80))).not.toContain("global (not set)");
      expect(plain(fixture.host.widgetContainerAbove.render(80))).not.toContain("PROJECT WIDGET");
      expect(plain(fixture.host.widgetContainerBelow.render(80))).toContain("PROJECT WIDGET");
      const saved: unknown = JSON.parse(readFileSync(globalPath, "utf8"));
      expect(saved).toMatchObject({
        "ext.pi-editor-widgets": { layout: { aboveEditor: [], belowEditor: [["widget:project"]] } }
      });
      menu.handleInput?.("\x03");
      await opening;
      expect(fixture.host.editorContainer.children[0]).toBe(editor);
      expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("PROJECT WIDGET");
      expect(plain(fixture.host.widgetContainerBelow.render(80))).not.toContain("PROJECT WIDGET");
    } finally {
      fixture.host.editorContainer.children[0]?.handleInput?.("\x03");
      await fixture.dispose();
      await opening;
    }
  }
);

it("closes /widgets on the first Ctrl+C after a native registration moves and restores the saved layout", async () => {
  const fixture = await hostFixture([editorWidgets]);
  const abort = new AbortController();
  let opening: Promise<void> | undefined;

  try {
    const projectPath = join(fixture.directory, ".pi/settings.json");
    const project = defaultLayout();
    project.belowEditor = [["widget:saved"]];
    const source = JSON.stringify({ "ext.pi-editor-widgets": { layout: project } });
    mkdirSync(join(fixture.directory, ".pi"));
    writeFileSync(projectPath, source);
    await fixture.bind();
    fixture.ui.setWidget("saved", ["SAVED"]);
    fixture.ui.setWidget("moving", ["MOVING"]);
    const above = () => plain(fixture.host.widgetContainerAbove.render(80));
    const below = () => plain(fixture.host.widgetContainerBelow.render(80));
    expect(below()).toContain("SAVED");
    const runner = fixture.session.extensionRunner;
    const editor = fixture.host.editorContainer.children[0];
    opening = runner.getCommand("widgets")?.handler("", {
      ...runner.createCommandContext(),
      signal: abort.signal
    });
    await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor), {
      interval: 1,
      timeout: STEP_TIMEOUT_MS
    });
    const menu = fixture.host.editorContainer.children[0]!;
    menu.handleInput?.("\t"); // Preview the unset global scope instead of the project override.
    expect(above()).toContain("SAVED");
    expect(below()).not.toContain("SAVED");
    menu.handleInput?.("\r"); // Above editor -> rows
    menu.handleInput?.("\x1b[B"); // Select the moving widget's native row.
    menu.handleInput?.("\r"); // Row -> contents
    menu.render(80);
    fixture.ui.setWidget("moving", ["MOVED"], { placement: "belowEditor" });
    // No intervening render: close must not be consumed by stale-selection rejection.
    menu.handleInput?.("\x03");
    await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).toBe(editor), {
      interval: 1,
      timeout: STEP_TIMEOUT_MS
    });
    await opening;
    expect(above()).not.toContain("SAVED");
    expect(above()).not.toContain("MOVED");
    expect(below()).toContain("SAVED");
    expect(below()).toContain("MOVED");
    expect(readFileSync(projectPath, "utf8")).toBe(source);
    expect(() => readFileSync(join(fixture.agentDir, "settings.json"))).toThrow();
  } finally {
    abort.abort();

    try {
      await opening;
    } finally {
      await fixture.dispose();
    }
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
      await vi.waitFor(() => expect(fixture.host.editorContainer.children[0]).not.toBe(editor), {
        interval: 1,
        timeout: STEP_TIMEOUT_MS
      });
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
