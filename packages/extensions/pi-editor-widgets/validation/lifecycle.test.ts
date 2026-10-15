import { readFileSync } from "node:fs";

import { initTheme, InteractiveMode } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, vi } from "vite-plus/test";

import { findWidgetHost } from "../src/host.ts";
import editorWidgets from "../src/index.ts";
import { defaultLayout } from "../src/layout.ts";
import { widgetSettings } from "../src/settings.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

it("discovers preexisting native closures when enabled on reload, then survives repeated reloads", async () => {
  let enabled = false;
  const fixture = await hostFixture([
    (pi) => {
      if (enabled) editorWidgets(pi);
    }
  ]);
  const { host, ui, session } = fixture;
  const settings = widgetSettings({
    cwd: fixture.directory,
    agentDir: fixture.agentDir,
    projectTrusted: true
  });
  const layout = defaultLayout();
  layout.belowEditor = [["widget:existing", "separator", "status:existing"]];
  settings.save("global", layout);

  try {
    await fixture.bind();
    ui.setWidget("existing", ["NATIVE"]);
    ui.setStatus("existing", "STATUS");
    const instance = host.extensionWidgetsAbove.get("existing");
    enabled = true;
    await session.reload();
    expect(plain(host.widgetContainerAbove.render(80))).not.toContain("NATIVE");
    expect(plain(host.widgetContainerBelow.render(80))).toContain("NATIVE");
    expect(host.extensionWidgetsAbove.get("existing")).toBe(instance);
    expect(host.customFooter).toBeDefined();

    for (let i = 0; i < 2; i++) {
      host.resetExtensionUI(); // Native /reload resets the UI before session.reload.
      await session.reload();
      ui.setWidget("existing", ["RELOADED"]);
      expect(plain(host.widgetContainerBelow.render(80)).match(/RELOADED/g)).toEqual(["RELOADED"]);
    }
  } finally {
    await fixture.dispose();
  }
});

it.each(["regular", "fullscreen"] as const)(
  "updates through the real %s renderer proxy, mode switches, resizing and themes",
  async (mode) => {
    const fixture = await hostFixture([editorWidgets], mode);
    const { host, ui, terminal } = fixture;

    try {
      await fixture.bind();
      ui.setStatus("live", "FIRST");
      expect(plain(host.footerContainer.render(80))).toContain("FIRST");
      ui.setStatus("live", "SECOND");
      expect(plain(host.footerContainer.render(80))).toContain("SECOND");
      initTheme("light");
      host.ui.invalidate();
      expect(plain(host.footerContainer.render(80))).toContain("SECOND");
      host.switchTuiMode(mode === "regular" ? "fullscreen" : "regular", false, false);
      ui.setStatus("live", "SWITCHED");
      expect(plain(host.footerContainer.render(80))).toContain("SWITCHED");
      terminal.columns = 12;
      terminal.rows = 10;
      host.ui.requestRender();
      const lines = host.renderer.render(12);
      expect(lines.every((line) => visibleWidth(line) <= 12)).toBe(true);
      host.switchTuiMode(mode, false, false);
      ui.setStatus("live", "BACK");
      expect(plain(host.footerContainer.render(30))).toContain("BACK");
    } finally {
      initTheme("dark");
      await fixture.dispose();
    }
  }
);

it("releases borrowed instances at shutdown and reacquires a clean registry for a new session", async () => {
  const instances: {
    render: ReturnType<typeof vi.fn>;
    invalidate(): void;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const fixture = await hostFixture([
    editorWidgets,
    (pi) =>
      pi.on("session_start", (_, ctx) => {
        const component = { render: vi.fn(() => ["CURRENT"]), invalidate() {}, dispose: vi.fn() };
        instances.push(component);
        ctx.ui.setWidget("session", () => component);
      })
  ]);

  try {
    await fixture.bind();
    fixture.host.widgetContainerAbove.render(80);
    const first = instances[0];
    expect(first).toBeDefined();
    await fixture.session.extensionRunner.emit({ type: "session_shutdown", reason: "new" });
    expect(first?.dispose).not.toHaveBeenCalled();
    fixture.host.resetExtensionUI();
    expect(first?.dispose).toHaveBeenCalledOnce();
    const oldRenders = first?.render.mock.calls.length;
    fixture.session.sessionManager.newSession();
    await fixture.session.extensionRunner.emit({ type: "session_start", reason: "new" });
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("CURRENT");
    expect(instances).toHaveLength(2);
    expect(first?.render.mock.calls.length).toBe(oldRenders);
  } finally {
    await fixture.dispose();
  }
});

it("reports unsupported discovery without acquiring a footer or changing native registrations", async () => {
  const fixture = await hostFixture([editorWidgets]);
  const notify = vi.fn();

  try {
    fixture.ui.setWidget("existing", ["NATIVE"]);
    const instance = fixture.host.extensionWidgetsAbove.get("existing");
    await fixture.session.bindExtensions({
      mode: "tui",
      uiContext: { ...fixture.ui, setStatus() {}, notify }
    });
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("unsupported Pi widget registry"),
      "warning"
    );
    expect(fixture.host.customFooter).toBeUndefined();
    expect(fixture.host.extensionWidgetsAbove.get("existing")).toBe(instance);
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("NATIVE");
  } finally {
    await fixture.dispose();
  }
});

it("captures the host without native status effects and restores its temporary prototype hook", async () => {
  const fixture = await hostFixture();
  const before = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionStatus");
  const request = vi.spyOn(fixture.host.renderer, "requestRender");

  try {
    expect(findWidgetHost(fixture.ui)?.host).toBe(fixture.host);
    expect(fixture.host.footerDataProvider.getExtensionStatuses().size).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(
      Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionStatus")
    ).toEqual(before);
  } finally {
    request.mockRestore();
    await fixture.dispose();
  }
});

it("stays inactive outside the TUI and explains why the settings command cannot open", async () => {
  // Print, JSON and RPC modes share the single non-TUI branch.
  const fixture = await hostFixture([editorWidgets]);
  const before = Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionStatus");
  const ui = {
    ...fixture.ui,
    setStatus: vi.fn(),
    setWidget: vi.fn(),
    setFooter: vi.fn(),
    notify: vi.fn()
  };

  try {
    await fixture.session.bindExtensions({ mode: "rpc", uiContext: ui });
    const runner = fixture.session.extensionRunner;
    expect(ui.notify).not.toHaveBeenCalled();
    await runner.getCommand("widgets")?.handler("", runner.createCommandContext());
    expect(ui.setStatus).not.toHaveBeenCalled();
    expect(ui.setWidget).not.toHaveBeenCalled();
    expect(ui.setFooter).not.toHaveBeenCalled();
    expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining("interactive TUI"), "error");
    expect(fixture.host.customFooter).toBeUndefined();
    expect(
      Object.getOwnPropertyDescriptor(InteractiveMode.prototype, "setExtensionStatus")
    ).toEqual(before);
    expect(() => readFileSync(`${fixture.agentDir}/settings.json`)).toThrow();
  } finally {
    await fixture.dispose();
  }
});
