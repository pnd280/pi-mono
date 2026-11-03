import { mkdirSync, readFileSync, rmdirSync } from "node:fs";

import { getKeybindings, stripTerminalSequences } from "@earendil-works/pi-tui";
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
const save = "\x13";

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
    keys: getKeybindings(),
    rows: () => fixture.terminal.rows,
    requestRender,
    close
  });

  onTestFinished(() => menu.dispose());

  return { settings, coordinator, close, menu, requestRender };
}

function select(menu: WidgetMenu, label: string): void {
  const selected = new RegExp(`^\\s*→ ${label}(\\s|$)`, "m");
  for (let index = 0; index < 10 && !selected.test(plain(menu.render(200))); index++)
    menu.handleInput(down);
  expect(plain(menu.render(200))).toMatch(selected);
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
    mkdirSync(`${settings.paths.global}.lock`);
    menu.handleInput(save);
    expect(readFileSync(settings.paths.global, "utf8")).toBe(before);
    expect(plain(menu.render(200))).toContain("global* (not set)");
    expect(plain(menu.render(200))).toContain("Draft retained");
    expect(plain(fixture.host.widgetContainerAbove.render(80))).not.toContain("NATIVE");
    rmdirSync(`${settings.paths.global}.lock`);
    menu.handleInput(save);
    expect(plain(menu.render(200))).not.toMatch(/global(\*| \(not set\))/);
    expect(settings.load().global?.hidden).toEqual(["widget:one"]);
    expect(settings.load().global?.aboveEditor.flat()).not.toContain("widget:one");
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
    menu.handleInput(save);
    expect(plain(menu.render(140))).toContain("global* (not set)");
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
    const { coordinator, menu, settings } = menuFor(fixture);

    try {
      if (scope === "inherited project") menu.handleInput("\t");
      menu.handleInput(down);
      menu.handleInput(down);
      menu.handleInput(enter);
      menu.handleInput(down);
      menu.handleInput(down);
      menu.handleInput(enter);
      select(menu, "middle");
      menu.render(80);
      if (scope === "inherited project") menu.handleInput("\t");
      fixture.ui.setStatus("first", "FIRST");

      if (scope === "inherited project") {
        menu.handleInput(save);
        menu.handleInput("\t");
      }

      menu.handleInput(remove);
      menu.handleInput(save);
      const saved = settings.load()[scope === "global" ? "global" : "project"];
      expect(saved?.hidden).toEqual(["status:middle"]);
      expect(saved?.footer[2]).toContain("status:first");
      expect(saved?.footer[2]).toContain("status:last");
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
    const { coordinator, menu, settings } = menuFor(fixture);

    try {
      menu.handleInput(enter);
      if (view !== "rows") menu.handleInput(enter);
      if (view === "picker") menu.handleInput("a");
      menu.render(80);
      fixture.ui.setWidget("first", ["MOVED"], { placement: "belowEditor" });
      // No intervening render: the stale keypress must not edit the new occupant.
      menu.handleInput(view === "picker" ? enter : remove);
      const text = plain(menu.render(200));
      expect(text).toContain("global (not set)");
      expect(text).toContain("Widgets › Above editor");
      expect(text).not.toContain("› Row");
      menu.handleInput(save);
      expect(settings.load().global?.aboveEditor).toEqual([["widget:second"]]);
      expect(settings.load().global?.belowEditor).toEqual([["widget:first"]]);
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
  const { coordinator, menu, settings } = menuFor(fixture);

  try {
    menu.handleInput(enter);
    menu.handleInput(down);
    menu.handleInput(enter);
    menu.render(80);
    fixture.ui.setWidget("first", ["MOVED"], { placement: "belowEditor" });
    menu.handleInput(remove);
    menu.handleInput(save);
    expect(settings.load().global?.hidden).toEqual(["widget:second"]);
    expect(settings.load().global?.aboveEditor).toEqual([[], ["widget:third"]]);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps a separator anchored to its contributor when new statuses arrive", async () => {
  const fixture = await hostFixture();
  fixture.ui.setStatus("middle", "MIDDLE");
  fixture.ui.setStatus("last", "LAST");
  const { coordinator, menu, settings } = menuFor(fixture);

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
    menu.handleInput(save);
    expect(settings.load().global?.footer[2]).toEqual([
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
