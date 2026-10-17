import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, vi } from "vite-plus/test";

import { WidgetCoordinator } from "../src/coordinator.ts";
import { defaultLayout } from "../src/layout.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

it("keeps typing in the editor after a native click toggles a wrapped usage widget across redraws", async () => {
  // Context and token widgets share one mouse path; context also exercises the reserve label.
  const widget = "context";
  const compact = "75k/200k (auto)";
  const verbose = "75k/200k (37.5%) (auto ~150k)";
  const fixture = await hostFixture([], "fullscreen");
  const { host, ui, session, terminal } = fixture;
  terminal.columns = 40;
  terminal.rows = 10;
  const usage = vi.spyOn(session, "getContextUsage").mockReturnValue({
    tokens: 75000,
    contextWindow: 200000,
    percent: 37.5
  });
  const stats = vi.spyOn(session, "getSessionStats").mockReturnValue({
    ...session.getSessionStats(),
    tokens: { input: 100, output: 10, cacheRead: 900, cacheWrite: 50, total: 1060 },
    cost: 1.25
  });
  session.settingsManager.applyOverrides({ compaction: { enabled: true, reserveTokens: 50000 } });
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());
  const start = vi.spyOn(host.renderer.terminal, "start");

  try {
    const id = `builtin:${widget}`;
    const layout = defaultLayout();
    layout.hidden = layout.footer
      .flat()
      .filter((candidate) => candidate.startsWith("builtin:") && candidate !== id);
    layout.footer = [["status:left", "separator", id]];
    coordinator.apply(layout);
    ui.setStatus("left", "L".repeat(32));
    host.renderer.setFocus(host.editorContainer.children[0]!);
    host.renderer.start();
    const input = start.mock.calls[0]![0];
    const footer = () => host.footerContainer.render(terminal.columns).map(stripTerminalSequences);

    const assertDisplay = (text: string) => {
      host.renderer.renderNow();
      expect(footer()).toEqual(["L".repeat(32), text]);
    };

    // The final footer row is docked to the bottom of the native fullscreen layout.
    const press = `\x1b[<0;1;${terminal.rows}M`;
    const release = `\x1b[<0;1;${terminal.rows}m`;
    assertDisplay(compact);
    input(press);
    assertDisplay(compact);
    // Native dispatch must retain the pressed target when a new frame replaces its component.
    host.ui.requestRender();
    assertDisplay(compact);
    input(release);
    assertDisplay(verbose);
    input("x");
    expect(ui.getEditorText()).toBe("x");
    input(press);
    input(release);
    assertDisplay(compact);
  } finally {
    start.mockRestore();
    stats.mockRestore();
    usage.mockRestore();
    host.renderer.stop();
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("moves/hides intact native instances without taking over replacement, removal, or disposal", async () => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const disposal = vi.fn();
  const factory = vi.fn(() => ({
    render: () => ["ONE", "TWO"],
    invalidate: vi.fn(),
    dispose: disposal
  }));
  ui.setWidget("native", factory);
  ui.setStatus("native", "STATUS");
  const component = host.extensionWidgetsAbove.get("native");
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.footer = [["widget:native", "separator", "status:native"]];
    layout.hidden = [
      "builtin:cwd",
      "builtin:git-branch",
      "builtin:session-title",
      "builtin:tokens",
      "builtin:context",
      "builtin:model"
    ];
    coordinator.apply(layout);
    expect(plain(host.widgetContainerAbove.render(80))).toBe("");
    const footer = host.footerContainer.render(80);
    expect(footer).toHaveLength(2);
    for (const content of ["ONE", "TWO", "STATUS"]) expect(plain(footer)).toContain(content);
    expect(host.extensionWidgetsAbove.get("native")).toBe(component);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(disposal).not.toHaveBeenCalled();

    for (const mode of ["fullscreen", "regular"] as const) {
      expect(host.switchTuiMode(mode, false, false)).toBe(true);
      expect(plain(host.footerContainer.render(80))).toContain("ONE");
      expect(host.extensionWidgetsAbove.get("native")).toBe(component);
      expect(factory).toHaveBeenCalledOnce();
      expect(disposal).not.toHaveBeenCalled();
    }

    layout.footer = [];
    layout.hidden.push("widget:native", "status:native");
    coordinator.apply(layout);
    expect(plain(host.footerContainer.render(80))).toBe("");
    expect(disposal).not.toHaveBeenCalled();
    ui.setWidget("native", ["replacement"], { placement: "belowEditor" });
    expect(disposal).toHaveBeenCalledTimes(1);
    expect(plain(host.widgetContainerAbove.render(80))).toBe("");
    ui.setWidget("native", undefined);
    expect(host.extensionWidgetsAbove.has("native")).toBe(false);
    expect(host.extensionWidgetsBelow.has("native")).toBe(false);
    ui.setWidget("native", ["registered again"]);
    expect(plain(host.widgetContainerAbove.render(80))).toBe("");
    layout.hidden = layout.hidden.filter((id) => id !== "widget:native");
    layout.belowEditor = [["widget:native"]];
    coordinator.apply(layout);
    expect(plain(host.widgetContainerBelow.render(80))).toContain("registered again");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("diagnoses both footer ownership orders and leaves later owners untouched on teardown", async () => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const competitor = { render: () => ["OTHER"], invalidate() {}, dispose: vi.fn() };

  try {
    ui.setFooter(() => competitor);
    expect(() => new WidgetCoordinator(host, () => ui.theme, vi.fn())).toThrow("footer conflict");
    expect(competitor.dispose).not.toHaveBeenCalled();
    ui.setFooter(undefined);
    const warn = vi.fn();
    const coordinator = new WidgetCoordinator(host, () => ui.theme, warn);
    ui.setFooter(() => competitor);
    coordinator.dispose();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("footer conflict"));
    expect(host.customFooter).toBe(competitor);
    expect(competitor.dispose).toHaveBeenCalledTimes(1);
  } finally {
    await fixture.dispose();
  }
});

it("leaves later hooks installed while retained coordinator callbacks return to native behavior", async () => {
  const fixture = await hostFixture();
  const coordinator = new WidgetCoordinator(fixture.host, () => fixture.ui.theme, vi.fn());
  const retained = fixture.host.renderWidgets.bind(fixture.host);
  const laterOwner = vi.fn(() => retained());
  fixture.host.renderWidgets = laterOwner;

  try {
    fixture.ui.setWidget("before", ["NATIVE BEFORE TEARDOWN"]);
    fixture.host.widgetContainerAbove.addChild({ render: () => ["LATER ABOVE"], invalidate() {} });
    fixture.host.widgetContainerBelow.clear();
    fixture.host.widgetContainerBelow.addChild({ render: () => ["LATER BELOW"], invalidate() {} });
    coordinator.dispose();
    const above = plain(fixture.host.widgetContainerAbove.render(80));
    expect(above).toContain("NATIVE BEFORE TEARDOWN");
    expect(above).toContain("LATER ABOVE");
    expect(plain(fixture.host.widgetContainerBelow.render(80))).toBe("LATER BELOW");
    fixture.ui.setWidget("after", ["NATIVE AFTER TEARDOWN"]);
    expect(Object.getOwnPropertyDescriptor(fixture.host, "renderWidgets")?.value).toBe(laterOwner);
    expect(laterOwner).toHaveBeenCalled();
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("NATIVE AFTER TEARDOWN");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});
