import {
  Container,
  Text,
  stripTerminalSequences,
  wrapTextWithAnsi,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, vi } from "vite-plus/test";

import { WidgetCoordinator } from "../src/coordinator.ts";
import editorWidgets from "../src/index.ts";
import { defaultLayout } from "../src/layout.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");

it.each(["aboveEditor", "belowEditor", "footer"] as const)(
  "uses identical mixed-row and empty-transition behavior in %s",
  async (region) => {
    const fixture = await hostFixture();
    const { host, ui } = fixture;
    let expanded = true;
    ui.setWidget("mixed", () => ({
      render: () => (expanded ? ["ONE", "TWO"] : []),
      invalidate() {}
    }));
    ui.setStatus("mixed", "RIGHT");
    const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

    try {
      const layout = defaultLayout();
      layout.hidden = layout.footer.flat().filter((id) => id.startsWith("builtin:"));
      layout.footer = [];
      layout[region] = [["widget:mixed", "separator", "status:mixed"]];
      coordinator.apply(layout);
      const container = {
        aboveEditor: host.widgetContainerAbove,
        belowEditor: host.widgetContainerBelow,
        footer: host.footerContainer
      }[region];
      const initial = container.render(30);
      expect(initial).toHaveLength(region === "aboveEditor" ? 3 : 2);
      expect(coordinator.regionHeight(30)).toBe(3);
      for (const content of ["ONE", "TWO", "RIGHT"]) expect(plain(initial)).toContain(content);
      expanded = false;
      host.ui.requestRender();
      expect(plain(container.render(30))).toBe(region === "aboveEditor" ? "\nRIGHT" : "RIGHT");
      expanded = true;
      host.ui.requestRender();
      expect(plain(container.render(30))).toBe(plain(initial));
      expect(layout[region]).toEqual([["widget:mixed", "separator", "status:mixed"]]);
    } finally {
      coordinator.dispose();
      await fixture.dispose();
    }
  }
);

it.each(["regular", "fullscreen"] as const)(
  "reserves one blank line above populated and empty widgets in %s mode",
  async (mode) => {
    const fixture = await hostFixture([], mode);
    const { host, ui } = fixture;
    const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

    try {
      const layout = defaultLayout();
      layout.hidden = layout.footer.flat().filter((id) => id.startsWith("builtin:"));
      layout.footer = [];
      coordinator.apply(layout);
      expect(host.widgetContainerAbove.render(80)).toEqual([""]);
      expect(coordinator.regionHeight(80)).toBe(1);
      let lines = ["WIDGET"];
      ui.setWidget("spacing", () => ({ render: () => lines, invalidate() {} }));
      expect(host.widgetContainerAbove.render(80).map(stripTerminalSequences)).toEqual([
        "",
        "WIDGET"
      ]);
      expect(coordinator.regionHeight(80)).toBe(2);
      lines = [];
      host.ui.requestRender();
      expect(host.widgetContainerAbove.render(80)).toEqual([""]);
      expect(coordinator.regionHeight(80)).toBe(1);
      ui.setWidget("spacing", undefined);
      expect(host.widgetContainerAbove.render(80)).toEqual([""]);
      expect(host.widgetContainerBelow.render(80)).toEqual([]);
      expect(host.footerContainer.render(80)).toEqual([]);
      coordinator.dispose();
      expect(host.widgetContainerAbove.render(80)).toEqual([""]);
    } finally {
      coordinator.dispose();
      await fixture.dispose();
    }
  }
);

it.each(["regular", "fullscreen"] as const)(
  "compacts native string-array widgets in shared rows in %s mode",
  async (mode) => {
    const fixture = await hostFixture([], mode);
    const { host, ui } = fixture;
    ui.setWidget("first", ["\x1b[31mfirst\x1b[39m"]);
    ui.setWidget("second", ["second"]);
    const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

    try {
      const layout = defaultLayout();
      layout.hidden = layout.footer.flat().filter((id) => id.startsWith("builtin:"));
      layout.footer = [["widget:first", "separator", "widget:second"]];
      coordinator.apply(layout);
      for (const width of [80, 20])
        expect(plain(host.footerContainer.render(width))).toBe(" first •  second");
      expect(
        host.footerContainer
          .render(5)
          .map((line) => stripTerminalSequences(line).trim())
          .join("")
      ).toBe("firstsecond");
    } finally {
      coordinator.dispose();
      await fixture.dispose();
    }
  }
);

it.each([20])("keeps native mouse geometry after wrapping %i-column widgets", async (length) => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const mouse = vi.fn(() => ({ handled: true }));
  const component = new Container();
  component.addChild({
    render: (width) => wrapTextWithAnsi("a".repeat(length), width),
    invalidate() {},
    handleMouse: mouse
  });
  ui.setWidget("left", () => component);
  ui.setWidget("right", () => ({
    render: (width) => wrapTextWithAnsi("b".repeat(length), width),
    invalidate() {}
  }));
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.hidden = layout.footer.flat().filter((id) => id.startsWith("builtin:"));
    layout.footer = [["widget:right", "widget:left"]];
    coordinator.apply(layout);
    expect(plain(host.footerContainer.render(30))).toBe(
      "b".repeat(length) + "\n" + "a".repeat(length)
    );
    host.footerContainer.handleMouse({
      type: "press",
      button: "left",
      x: 1,
      y: 1,
      screenX: 1,
      screenY: 1,
      width: 30,
      height: 2,
      shift: false,
      alt: false,
      ctrl: false
    });
    expect(mouse).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1, y: 0, width: 30, height: 1 })
    );
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it.each(
  (["aboveEditor", "belowEditor", "footer"] as const).flatMap((region) =>
    (["context", "tokens"] as const).map((widget) => [region, widget] as const)
  )
)("clicking %s toggles every %s copy without focus or persistence", async (region, widget) => {
  const fixture = await hostFixture([], "fullscreen");
  const { host, ui, session } = fixture;
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
  const text = {
    context: {
      compact: "75k/200k (auto)",
      verbose: "75k/200k (37.5%) (auto ~150k)",
      regular: "75k/200k (37.5%) (auto)"
    },
    tokens: {
      compact: "↑100 ↓10",
      verbose: "↑100 ↓10 R900 W50 $1.250",
      regular: "↑100 ↓10 R900 W50 $1.250"
    }
  }[widget];
  const id = `builtin:${widget}`;
  session.settingsManager.applyOverrides({ compaction: { enabled: true, reserveTokens: 50000 } });
  ui.setStatus("left", "LEFT");
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.hidden = layout.footer
      .flat()
      .filter((candidate) => candidate.startsWith("builtin:") && candidate !== id);
    layout.aboveEditor = [["status:left", "separator", id]];
    layout.belowEditor = [["status:left", "separator", id]];
    layout.footer = [["status:left", "separator", id]];
    coordinator.apply(layout, 150000);
    const containers = {
      aboveEditor: host.widgetContainerAbove,
      belowEditor: host.widgetContainerBelow,
      footer: host.footerContainer
    };
    const container = containers[region];

    const assertCopies = (text: string) => {
      for (const copy of Object.values(containers))
        expect(copy.render(80).join("\n")).toContain(
          ui.theme.fg(widget === "context" ? "success" : "dim", text)
        );
    };

    assertCopies(text.compact);
    const lines = container.render(80).map(stripTerminalSequences);
    const y = lines.findIndex((line) => line.includes(text.compact));
    const x = lines[y]!.indexOf(text.compact);
    const event: TuiMouseEvent = {
      type: "press",
      button: "left",
      x,
      y,
      screenX: x,
      screenY: y,
      width: 80,
      height: lines.length,
      shift: false,
      alt: false,
      ctrl: false
    };
    const entries = session.sessionManager.getEntries();
    const settings = session.settingsManager.getGlobalSettings();
    for (const ignored of [
      { type: "wheel", wheelDelta: 1 },
      { type: "click", button: "right" },
      { type: "click", x: 79 },
      { type: "drag" }
    ] satisfies Partial<TuiMouseEvent>[])
      expect(container.handleMouse({ ...event, ...ignored })).toBeUndefined();
    const press = container.handleMouse(event);
    expect(press).toMatchObject({ handled: true });
    expect(press?.focus).not.toBe(true);
    assertCopies(text.compact);
    container.handleMouse({ ...event, type: "release" });
    const requestRender = vi.spyOn(host.renderer, "requestRender");
    const click = container.handleMouse({ ...event, type: "click" });
    expect(click).toMatchObject({ handled: true });
    expect(click?.focus).not.toBe(true);
    expect(requestRender).toHaveBeenCalled();
    requestRender.mockRestore();
    assertCopies(text.verbose);
    coordinator.showDraft(layout);
    assertCopies(text.verbose);
    coordinator.showDraft(undefined);
    coordinator.apply(layout, 150000);
    assertCopies(text.verbose);
    container.handleMouse({ ...event, type: "click" });
    assertCopies(text.compact);
    host.switchTuiMode("regular", false, false);
    assertCopies(text.regular);
    expect(container.handleMouse(event)).toBeUndefined();
    expect(container.handleMouse({ ...event, type: "click" })).toBeUndefined();
    expect(coordinator.toggleUsage(widget)).toBe(false);
    assertCopies(text.regular);
    host.switchTuiMode("fullscreen", false, false);
    assertCopies(text.compact);
    expect(session.sessionManager.getEntries()).toEqual(entries);
    expect(session.settingsManager.getGlobalSettings()).toEqual(settings);
  } finally {
    stats.mockRestore();
    usage.mockRestore();
    coordinator.dispose();
    await fixture.dispose();
  }
});

it.each([
  ["context", "75k/200k (auto)", "75k/200k (37.5%) (auto ~150k)"],
  ["tokens", "↑100 ↓10", "↑100 ↓10 R900 W50 $1.250"]
] as const)(
  "routes native press/release to a wrapped %s widget across redraws",
  async (widget, compact, verbose) => {
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
      const footer = () =>
        host.footerContainer.render(terminal.columns).map(stripTerminalSequences);

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
  }
);

it("discovers before/after startup registrations through real extension binding", async () => {
  const fixture = await hostFixture([
    (pi) =>
      pi.on("session_start", (_, ctx) => {
        ctx.ui.setWidget("before", ["BEFORE"]);
        ctx.ui.setStatus("before", "STATUS");
      }),
    editorWidgets,
    (pi) =>
      pi.on("session_start", (_, ctx) =>
        ctx.ui.setWidget("after", ["AFTER"], { placement: "belowEditor" })
      )
  ]);

  try {
    await fixture.bind();
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("BEFORE");
    expect(plain(fixture.host.widgetContainerBelow.render(80))).toContain("AFTER");
    expect(plain(fixture.host.footerContainer.render(80))).toContain("STATUS");
    expect(fixture.host.customFooter).toBeDefined();
  } finally {
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

it("preserves invalidation and native mouse targets", async () => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const render = vi.fn((width: number) => new Text("clickable", 0, 0).render(width));
  const invalidate = vi.fn();
  const mouse = vi.fn(() => ({ handled: true, capture: true, focus: true }));
  const component = { render, invalidate, handleMouse: mouse };
  ui.setWidget("mouse", () => component);
  ui.setStatus("left", "LEFT");
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.aboveEditor = [["status:left", "separator", "widget:mouse"]];
    layout.footer = [];
    layout.hidden = [
      "builtin:cwd",
      "builtin:git-branch",
      "builtin:session-title",
      "builtin:tokens",
      "builtin:context",
      "builtin:model"
    ];
    coordinator.apply(layout);
    const lines = host.widgetContainerAbove.render(80).map(stripTerminalSequences);
    const column = (lines[1] ?? "").indexOf("clickable");
    expect(column).toBeGreaterThanOrEqual(0);
    const calls = render.mock.calls.length;
    const event = {
      type: "press" as const,
      button: "left" as const,
      x: column + 1,
      y: 1,
      screenX: column + 1,
      screenY: 5,
      width: 80,
      height: 2,
      shift: false,
      alt: false,
      ctrl: false
    };
    host.widgetContainerAbove.handleMouse({ ...event, y: 0, screenY: 4 });
    expect(mouse).not.toHaveBeenCalled();
    const result = host.widgetContainerAbove.handleMouse(event);
    expect(mouse).toHaveBeenCalledWith(expect.objectContaining({ x: 1, y: 0 }));
    expect(result).toMatchObject({
      capture: true,
      focusTarget: component,
      target: { component, originY: 5 }
    });
    host.widgetContainerAbove.invalidate();
    expect(invalidate).toHaveBeenCalled();
    host.widgetContainerAbove.render(40);
    expect(render.mock.calls.length).toBeGreaterThan(calls);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("renders duplicated placements from one native instance with the same render width", async () => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const factory = vi.fn();
  let rendered = 0;
  const widths: number[] = [];
  const component = {
    render: vi.fn((width: number) => {
      rendered = width;

      return ["DUP"];
    }),
    invalidate() {},
    handleMouse: vi.fn(() => {
      widths.push(rendered);

      return { handled: true };
    })
  };
  ui.setWidget(
    "dup",
    factory.mockImplementation(() => component)
  );
  ui.setStatus("left", "LEFT");
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.aboveEditor = [["widget:dup"]];
    layout.footer = [["status:left", "separator", "widget:dup"], ["status:left"]];
    layout.hidden = defaultLayout()
      .footer.flat()
      .filter((id) => id.startsWith("builtin:"));
    coordinator.apply(layout);
    expect(plain(host.widgetContainerAbove.render(40))).toBe("\nDUP");
    expect(plain(host.footerContainer.render(40))).toBe("LEFT \u2022 DUP\nLEFT");
    expect(coordinator.regionHeight(40)).toBe(4);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(component.render.mock.calls).toEqual([[40], [40]]);
    const event = {
      type: "press" as const,
      button: "left" as const,
      x: 1,
      y: 0,
      screenX: 1,
      screenY: 0,
      width: 40,
      height: 1,
      shift: false,
      alt: false,
      ctrl: false
    };
    host.widgetContainerAbove.handleMouse({ ...event, y: 1, screenY: 1, height: 2 });
    host.footerContainer.handleMouse({ ...event, x: 8 });
    expect(widths).toEqual([40, 40]);
    expect(component.render.mock.calls).toEqual([[40], [40]]);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps nested mouse targets at the copy's render width even when flex shrinks its hit area", async () => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const top = vi.fn(() => ({ handled: true }));
  const bottom = vi.fn(() => ({ handled: true }));
  const component = new Container();
  component.addChild({
    render: (width) => (width < 10 ? ["TOP", "WRP"] : ["TOP"]),
    invalidate() {},
    handleMouse: top
  });
  component.addChild({ render: () => ["END"], invalidate() {}, handleMouse: bottom });
  ui.setWidget("nested", () => component);
  ui.setWidget("left", () => ({ render: () => ["LEFT", "LEFT", "LEFT"], invalidate() {} }));
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.hidden = layout.footer.flat().filter((id) => id.startsWith("builtin:"));
    layout.aboveEditor = [["flex", "widget:nested"]];
    layout.footer = [["widget:left", "separator", "widget:nested"]];
    coordinator.apply(layout);
    const above = host.widgetContainerAbove.render(40).map(stripTerminalSequences);
    expect(above).toEqual([
      "",
      "                                     TOP",
      "                                     END"
    ]);
    host.footerContainer.render(40);
    const event = {
      type: "press" as const,
      button: "left" as const,
      x: 38,
      y: 2,
      screenX: 38,
      screenY: 2,
      width: 40,
      height: 3,
      shift: false,
      alt: false,
      ctrl: false
    };
    host.widgetContainerAbove.handleMouse(event);
    expect(top).not.toHaveBeenCalled();
    expect(bottom).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 0, width: 40 }));
    host.footerContainer.handleMouse({ ...event, x: 8, y: 1 });
    expect(bottom).toHaveBeenCalledTimes(2);
    expect(bottom).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1, y: 0, width: 40 }));
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
    coordinator.dispose();
    fixture.ui.setWidget("after", ["NATIVE AFTER TEARDOWN"]);
    expect(Object.getOwnPropertyDescriptor(fixture.host, "renderWidgets")?.value).toBe(laterOwner);
    expect(laterOwner).toHaveBeenCalled();
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("NATIVE AFTER TEARDOWN");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("bounds all three regions together under vertical pressure while preserving borrowed instances", async () => {
  const fixture = await hostFixture();
  const { host, ui } = fixture;
  const long = { render: () => Array.from({ length: 30 }, (_, i) => `line ${i}`), invalidate() {} };
  ui.setWidget("a", () => long);
  ui.setWidget("b", () => long, { placement: "belowEditor" });
  const coordinator = new WidgetCoordinator(host, () => ui.theme, vi.fn());

  try {
    const lines = [
      ...host.widgetContainerAbove.render(20),
      ...host.widgetContainerBelow.render(20),
      ...host.footerContainer.render(20)
    ];
    expect(lines.length).toBeLessThanOrEqual(20);
    expect(lines[0]).toBe("");
    expect(plain(lines)).toContain("widgets clipped");
    expect(host.extensionWidgetsAbove.get("a")).toBe(long);
    expect(host.extensionWidgetsBelow.get("b")).toBe(long);
    expect(() => host.footerContainer.render(0)).not.toThrow();
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});
