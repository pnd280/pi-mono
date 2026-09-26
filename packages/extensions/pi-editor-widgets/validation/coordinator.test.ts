import { Text, stripTerminalSequences } from "@earendil-works/pi-tui";
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
      expect(initial).toHaveLength(2);
      for (const content of ["ONE", "TWO", "RIGHT"]) expect(plain(initial)).toContain(content);
      expanded = false;
      host.ui.requestRender();
      expect(plain(container.render(30))).toBe("RIGHT");
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
    coordinator.preview(layout, 25);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(disposal).not.toHaveBeenCalled();
    layout.footer = [];
    layout.hidden.push("widget:native", "status:native");
    coordinator.apply(layout);
    expect(plain(host.footerContainer.render(80))).toBe("");
    expect(disposal).not.toHaveBeenCalled();
    ui.setWidget("native", ["replacement"]);
    expect(disposal).toHaveBeenCalledTimes(1);
    expect(plain(host.widgetContainerAbove.render(80))).toBe("");
    ui.setWidget("native", undefined);
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

it("preserves invalidation and native mouse targets, and does not render native instances for previews", async () => {
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
    const column = plain(host.widgetContainerAbove.render(80)).indexOf("clickable");
    expect(column).toBeGreaterThanOrEqual(0);
    const calls = render.mock.calls.length;
    coordinator.preview(layout, 20);
    expect(render).toHaveBeenCalledTimes(calls);
    const result = host.widgetContainerAbove.handleMouse({
      type: "press",
      button: "left",
      x: column + 1,
      y: 0,
      screenX: column + 1,
      screenY: 4,
      width: 80,
      height: 1,
      shift: false,
      alt: false,
      ctrl: false
    });
    expect(mouse).toHaveBeenCalledWith(expect.objectContaining({ x: 1, y: 0 }));
    expect(result).toMatchObject({ capture: true, focusTarget: component, target: { component } });
    host.widgetContainerAbove.invalidate();
    expect(invalidate).toHaveBeenCalled();
    host.widgetContainerAbove.render(40);
    expect(render.mock.calls.length).toBeGreaterThan(calls);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("sanitizes unseen-widget preview labels without rendering another live copy", async () => {
  const fixture = await hostFixture();
  const key = "control\x1b[2J";
  const render = vi.fn(() => ["LIVE"]);
  fixture.ui.setWidget(key, () => ({ render, invalidate() {} }));
  const coordinator = new WidgetCoordinator(fixture.host, () => fixture.ui.theme, vi.fn());

  try {
    const layout = defaultLayout();
    layout.aboveEditor = [[`widget:${key}`]];
    const preview = coordinator.preview(layout, 80).aboveEditor;
    expect(render).not.toHaveBeenCalled();
    expect(preview.join("")).not.toContain("\x1b[2J");
    expect(plain(preview)).toContain("widget:control: preview after placement");
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

it("bounds all three regions together under vertical pressure and preserves placement on resizing", async () => {
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
    expect(plain(lines)).toContain("widgets clipped");
    expect(host.extensionWidgetsAbove.get("a")).toBe(long);
    expect(host.extensionWidgetsBelow.get("b")).toBe(long);
    expect(() => host.footerContainer.render(0)).not.toThrow();
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});
