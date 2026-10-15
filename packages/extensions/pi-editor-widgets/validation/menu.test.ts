import { mkdirSync, readFileSync, rmdirSync } from "node:fs";

import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, onTestFinished, vi } from "vite-plus/test";

import { WidgetCoordinator } from "../src/coordinator.ts";
import { defaultLayout, type Layout } from "../src/layout.ts";
import { WidgetMenu } from "../src/menu/widget-menu.ts";
import { widgetSettings } from "../src/settings.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");
const enter = "\r";
const down = "\x1b[B";
const escape = "\x1b";
const remove = "\x1b[3~";

function menuFor(fixture: Awaited<ReturnType<typeof hostFixture>>, global?: Layout) {
  const settings = widgetSettings({
    cwd: fixture.directory,
    agentDir: fixture.agentDir,
    projectTrusted: true
  });
  const coordinator = new WidgetCoordinator(fixture.host, () => fixture.ui.theme, vi.fn());
  const close = vi.fn();
  const requestRender = vi.fn();
  const preferences = settings.load();
  if (global !== undefined) preferences.global = global;
  coordinator.apply(preferences.project ?? preferences.global);
  const menu = new WidgetMenu({
    settings,
    preferences,
    coordinator,
    theme: () => fixture.ui.theme,
    rows: () => fixture.terminal.rows,
    requestRender,
    close
  });

  onTestFinished(() => menu.dispose());

  return { settings, coordinator, close, menu, requestRender };
}

function select(menu: WidgetMenu, id: string): void {
  const { choices, view } = menu.drafts.snapshot();
  const target = choices.findIndex((choice) => choice.id === id);
  expect(target).toBeGreaterThanOrEqual(0);
  const delta = target - view.selected;
  for (let index = 0; index < Math.abs(delta); index++)
    menu.handleInput(delta > 0 ? down : "\x1b[A");
}

it("retains a draft after a failed save and applies it once a retry succeeds", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const { settings, coordinator, menu } = menuFor(fixture);

  try {
    settings.save("global", defaultLayout());
    const before = readFileSync(settings.paths.global, "utf8");
    menu.handleInput(enter);
    menu.handleInput(enter);
    menu.handleInput(remove);
    const draft = structuredClone(menu.drafts.current.value);
    mkdirSync(`${settings.paths.global}.lock`);
    menu.handleInput("\x13");
    expect(readFileSync(settings.paths.global, "utf8")).toBe(before);
    expect(menu.drafts.current.value).toEqual(draft);
    expect(menu.drafts.current.saved).toBeUndefined();
    expect(plain(menu.render(200))).toContain("global* (not set)");
    expect(plain(menu.render(200))).toContain("Draft retained");
    rmdirSync(`${settings.paths.global}.lock`);
    menu.handleInput("\x13");
    expect(menu.drafts.current).toEqual({ value: draft, saved: draft });
    expect(settings.load().global?.hidden).toContain("widget:one");
    expect(plain(fixture.host.widgetContainerAbove.render(80))).not.toContain("NATIVE");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("refuses a stale menu save after footer ownership is lost", async () => {
  const fixture = await hostFixture();
  const { settings, coordinator, menu } = menuFor(fixture);

  try {
    for (let index = 0; index < 3; index++) menu.handleInput(down);
    menu.handleInput(enter);
    fixture.ui.setFooter(() => ({ render: () => ["OTHER"], invalidate() {} }));
    menu.handleInput("\x13");
    expect(menu.drafts.current).toEqual({ value: defaultLayout(), saved: undefined });
    expect(plain(menu.render(140))).toContain("Draft retained");
    expect(plain(menu.render(140))).toContain("footer conflict");
    expect(() => readFileSync(settings.paths.global)).toThrow();
    expect(plain(fixture.host.footerContainer.render(80))).toContain("OTHER");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("previews drafts live in the actual regions and restores the saved layout on close", async () => {
  const fixture = await hostFixture();
  const factory = vi.fn(() => ({ render: () => ["LIVE WIDGET"], invalidate() {} }));
  fixture.ui.setWidget("moving", factory);
  const { coordinator, close, menu, settings } = menuFor(fixture);
  const above = () => plain(fixture.host.widgetContainerAbove.render(80));
  const footer = () => plain(fixture.host.footerContainer.render(80));

  try {
    fixture.terminal.rows = 30;
    expect(above()).toBe("\nLIVE WIDGET");
    menu.handleInput(enter); // Above editor -> rows
    menu.handleInput(enter); // Row 1 -> contents
    menu.handleInput(remove);
    expect(above()).toBe("");
    menu.handleInput(escape);
    menu.handleInput(escape);
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(enter); // Footer -> rows
    menu.handleInput("a"); // New row -> contents
    menu.handleInput("a"); // Picker: separator, flex, then the hidden widget
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(enter);
    expect(footer()).toContain("LIVE WIDGET");
    expect(above()).toBe("");
    // No second copy inside the menu: it shrinks to leave the live regions visible.
    const text = menu.render(80);
    expect(plain(text)).not.toContain("LIVE WIDGET");
    const regionLines = [
      ...fixture.host.widgetContainerAbove.render(80),
      ...fixture.host.widgetContainerBelow.render(80),
      ...fixture.host.footerContainer.render(80)
    ];
    expect(text.length + regionLines.length).toBeLessThanOrEqual(fixture.terminal.rows);
    expect(factory).toHaveBeenCalledOnce();
    for (let index = 0; index < 3; index++) menu.handleInput(escape);
    expect(close).toHaveBeenCalledOnce();
    expect(above()).toBe("\nLIVE WIDGET");
    expect(footer()).not.toContain("LIVE WIDGET");
    expect(() => readFileSync(settings.paths.global)).toThrow();
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it.each(["global", "inherited project"])(
  "keeps the selected status identity in %s when new statuses sort ahead of it",
  async (scope) => {
    const fixture = await hostFixture();
    fixture.ui.setStatus("middle", "MIDDLE");
    fixture.ui.setStatus("last", "LAST");
    const { coordinator, menu } = menuFor(fixture);

    try {
      if (scope === "inherited project") menu.handleInput("\t");
      menu.handleInput(down);
      menu.handleInput(down);
      menu.handleInput(enter);
      menu.handleInput(down);
      menu.handleInput(down);
      menu.handleInput(enter);
      select(menu, "status:middle");
      menu.render(80);
      if (scope === "inherited project") menu.handleInput("\t");
      fixture.ui.setStatus("first", "FIRST");

      if (scope === "inherited project") {
        menu.handleInput("\x13");
        menu.handleInput("\t");
      }

      menu.handleInput(remove);
      expect(menu.drafts.layout().hidden).toEqual(["status:middle"]);
      expect(menu.drafts.layout().footer[2]).toContain("status:first");
      expect(menu.drafts.layout().footer[2]).toContain("status:last");
    } finally {
      coordinator.dispose();
      await fixture.dispose();
    }
  }
);

it.each(["rows", "contents", "picker"])(
  "does not retarget an edit in %s when its native row moves to another region",
  async (view) => {
    const fixture = await hostFixture();
    fixture.ui.setWidget("first", ["FIRST"]);
    fixture.ui.setWidget("second", ["SECOND"]);
    const { coordinator, menu } = menuFor(fixture);

    try {
      menu.handleInput(enter);
      if (view !== "rows") menu.handleInput(enter);
      if (view === "picker") menu.handleInput("a");
      menu.render(80);
      fixture.ui.setWidget("first", ["MOVED"], { placement: "belowEditor" });
      // No intervening render: the stale keypress must not edit the new occupant.
      menu.handleInput(view === "picker" ? enter : remove);
      expect(menu.drafts.current).toEqual({ value: undefined, saved: undefined });
      expect(menu.drafts.layout().aboveEditor).toEqual([["widget:second"]]);
      expect(menu.drafts.layout().belowEditor).toEqual([["widget:first"]]);
      expect(menu.drafts.view).toMatchObject({ kind: "rows", region: "aboveEditor" });
    } finally {
      coordinator.dispose();
      await fixture.dispose();
    }
  }
);

it("keeps a nested row anchored when a preceding native row moves away", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("first", ["FIRST"]);
  fixture.ui.setWidget("second", ["SECOND"]);
  fixture.ui.setWidget("third", ["THIRD"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.handleInput(enter);
    menu.handleInput(down);
    menu.handleInput(enter);
    menu.render(80);
    fixture.ui.setWidget("first", ["MOVED"], { placement: "belowEditor" });
    menu.handleInput(remove);
    expect(menu.drafts.layout().hidden).toEqual(["widget:second"]);
    expect(menu.drafts.layout().aboveEditor).toEqual([[], ["widget:third"]]);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps a separator anchored to its contributor when new statuses arrive", async () => {
  const fixture = await hostFixture();
  fixture.ui.setStatus("middle", "MIDDLE");
  fixture.ui.setStatus("last", "LAST");
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(enter);
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(enter);
    menu.handleInput(down);
    menu.render(80);
    fixture.ui.setStatus("first", "FIRST");
    menu.handleInput(remove);
    expect(menu.drafts.layout().footer[2]).toEqual([
      "status:first",
      "separator",
      "status:last",
      "status:middle"
    ]);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});
