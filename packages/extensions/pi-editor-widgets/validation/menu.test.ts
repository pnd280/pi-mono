import { mkdirSync, readFileSync, rmdirSync } from "node:fs";

import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it, vi } from "vite-plus/test";

import { WidgetCoordinator } from "../src/coordinator.ts";
import { defaultLayout } from "../src/layout.ts";
import { WidgetMenu } from "../src/menu.ts";
import { WidgetSettings, type Preferences } from "../src/settings.ts";

const plain = (lines: string[]) => lines.map(stripTerminalSequences).join("\n");
const enter = "\r";
const down = "\x1b[B";
const escape = "\x1b";
const remove = "\x1b[3~";

function menuFor(fixture: Awaited<ReturnType<typeof hostFixture>>) {
  const settings = new WidgetSettings({
    cwd: fixture.directory,
    agentDir: fixture.agentDir,
    projectTrusted: true
  });
  const coordinator = new WidgetCoordinator(fixture.host, () => fixture.ui.theme, vi.fn());
  const close = vi.fn();
  const apply = vi.fn((preferences: Preferences) =>
    coordinator.apply(preferences.project ?? preferences.global)
  );
  const menu = new WidgetMenu({
    settings,
    preferences: settings.load(),
    coordinator,
    theme: () => fixture.ui.theme,
    rows: () => fixture.terminal.rows,
    requestRender: vi.fn(),
    close,
    apply
  });

  return { settings, coordinator, close, apply, menu };
}

it("saves the displayed inherited layout even when an unset scope has not been edited", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const { settings, coordinator, menu } = menuFor(fixture);

  try {
    expect(plain(menu.render(40))).toContain("global (not set)");
    menu.handleInput("\x13");
    expect(settings.load().global?.aboveEditor).toEqual([["widget:one"]]);
    expect(plain(menu.render(80))).not.toContain("global (not set)");
    menu.handleInput("\t");
    expect(plain(menu.render(40))).toContain("project (not set)");
    const inherited = menu.drafts.layout();
    menu.handleInput("\x13");
    expect(settings.load().project).toEqual(inherited);
    expect(plain(menu.render(80))).not.toContain("not set");
    expect(menu.drafts.dirty).toBe(false);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps unset markers until save and identifies edits in either scope", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.handleInput(enter);
    menu.handleInput(enter);
    menu.handleInput(remove);
    const output = plain(menu.render(80));
    expect(output).toContain("global* (not set)");
    expect(output).toContain("Unsaved changes");
    menu.handleInput("\t");
    expect(plain(menu.render(80))).toContain("Unsaved draft in other scope");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("navigates, previews live and discards without persisting the draft", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const { settings, coordinator, close, menu, apply } = menuFor(fixture);

  try {
    fixture.host.widgetContainerAbove.render(80);
    menu.handleInput(enter); // Above -> Rows
    menu.handleInput(enter); // Row 1 -> Contents
    menu.handleInput(remove);
    expect(menu.drafts.layout().hidden).toContain("widget:one");
    expect(plain(fixture.host.widgetContainerAbove.render(80))).not.toContain("NATIVE");
    menu.handleInput("a");
    menu.handleInput(down);
    menu.handleInput(down);
    expect(plain(menu.render(80))).toContain("→ one");
    menu.handleInput(enter); // Re-add the individual hidden widget
    expect(menu.drafts.view.kind).toBe("contents");
    expect(menu.drafts.layout().hidden).not.toContain("widget:one");
    menu.handleInput(escape);
    menu.handleInput(escape);
    menu.handleInput(escape);
    expect(close).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("NATIVE");
    expect(() => readFileSync(settings.paths.global)).toThrow();
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("adds with a from populated and empty rows without redundant action or details views", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["ONE"]);
  const { coordinator, menu, apply } = menuFor(fixture);

  try {
    const root = plain(menu.render(80));
    expect(root).not.toContain("Save layout");

    menu.handleInput("a");
    menu.handleInput("?");
    expect(plain(menu.render(80))).toBe(root);
    menu.handleInput(enter);
    menu.handleInput(enter);
    const contents = plain(menu.render(80));
    expect(contents).not.toContain("Add item");
    menu.handleInput(enter);
    expect(menu.drafts.view.kind).toBe("contents");
    menu.handleInput("a");
    expect(menu.drafts.view.kind).toBe("picker");
    menu.handleInput(escape);
    menu.handleInput(remove);
    expect(plain(menu.render(40))).toContain("Empty row. Press a to add.");
    menu.handleInput(down);
    menu.handleInput(enter);
    expect(menu.drafts.view).toMatchObject({ kind: "contents", selected: 0 });
    menu.handleInput("a");
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(enter);
    expect(menu.drafts.layout().aboveEditor).toEqual([["widget:one"]]);
    expect(menu.drafts.layout().hidden).not.toContain("widget:one");
    expect(apply).not.toHaveBeenCalled();
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("retains failed drafts, applies successful saves, and renders the selected action on tiny terminals", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const { settings, coordinator, menu, apply } = menuFor(fixture);

  try {
    settings.save("global", defaultLayout());
    menu.handleInput(enter);
    menu.handleInput(enter);
    menu.handleInput(remove);
    const draft = structuredClone(menu.drafts.current.value);
    mkdirSync(`${settings.paths.global}.lock`);
    menu.handleInput("\x13");
    expect(apply).not.toHaveBeenCalled();
    expect(menu.drafts.current.value).toEqual(draft);
    expect(menu.drafts.dirty).toBe(true);
    expect(plain(menu.render(200))).toContain("Draft retained");
    rmdirSync(`${settings.paths.global}.lock`);
    menu.handleInput("\x13");
    expect(apply).toHaveBeenCalledOnce();
    expect(menu.drafts.dirty).toBe(false);
    expect(settings.load().global?.hidden).toContain("widget:one");
    expect(plain(fixture.host.widgetContainerAbove.render(80))).not.toContain("NATIVE");
    menu.handleInput(escape);
    menu.handleInput(escape);

    for (const rows of [1, 3, 5, 10, 24]) {
      fixture.terminal.rows = rows;
      const lines = menu.render(20);
      expect(lines.length).toBeLessThanOrEqual(Math.max(1, rows - 2));
      expect(lines.every((line) => visibleWidth(line) <= 20)).toBe(true);
      expect(plain(lines)).toContain("Above editor");
    }
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("refuses a stale menu save after footer ownership is lost", async () => {
  const fixture = await hostFixture();
  const { settings, coordinator, menu, apply } = menuFor(fixture);

  try {
    menu.drafts.reset();
    fixture.ui.setFooter(() => ({ render: () => ["OTHER"], invalidate() {} }));
    menu.handleInput("\x13");
    expect(apply).not.toHaveBeenCalled();
    expect(menu.drafts.dirty).toBe(true);
    expect(plain(menu.render(140))).toContain("Save failed. Draft retained.");
    expect(plain(menu.render(140))).toContain("Resolve footer conflict and /reload.");
    expect(() => readFileSync(settings.paths.global)).toThrow();
    expect(plain(fixture.host.footerContainer.render(80))).toContain("OTHER");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("saves scopes independently and explains when a project override still wins", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const settings = new WidgetSettings({
    cwd: fixture.directory,
    agentDir: fixture.agentDir,
    projectTrusted: true
  });
  const project = defaultLayout();
  project.belowEditor = [["widget:one"]];
  settings.save("project", project);
  const { coordinator, menu } = menuFor(fixture);

  try {
    expect(menu.drafts.scope).toBe("project");
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(down);
    menu.handleInput(enter); // Reset the project draft without saving it.
    expect(menu.drafts.current.value).toEqual(defaultLayout());
    menu.handleInput("\t");
    menu.handleInput(enter);
    menu.handleInput(enter);
    menu.handleInput(remove);
    menu.handleInput("\x13");
    expect(plain(menu.render(120))).toContain("Project layout applies on close.");
    // Live regions show the selected scope's draft, not the effective project override.
    expect(plain(fixture.host.widgetContainerBelow.render(80))).not.toContain("NATIVE");
    expect(settings.load().project).toEqual(project);
    menu.handleInput("\t");
    expect(menu.drafts.current.value).toEqual(defaultLayout());
    expect(menu.drafts.dirty).toBe(true);
    expect(settings.load().project).toEqual(project);
    menu.handleInput("\x13");
    expect(settings.load().project).toEqual(defaultLayout());
    expect(plain(fixture.host.widgetContainerBelow.render(80))).not.toContain("NATIVE");
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("NATIVE");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps essential controls readable at 40x10 and advertises only applicable actions", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["NATIVE"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    fixture.terminal.rows = 10;
    const root = plain(menu.render(40));
    expect(root).toContain("Ctrl+S save");
    expect(root).toContain("Esc close");
    expect(root).toContain("Tab scope");
    expect(root).not.toContain("Shift+");
    expect(root).not.toContain("Del ");
    menu.handleInput(enter);
    expect(plain(menu.render(40))).toContain("Shift+↑/↓ move");
    expect(plain(menu.render(40))).not.toContain("? details");
    menu.handleInput(enter);
    const contents = plain(menu.render(40));
    expect(contents).toContain("Esc back");
    expect(contents).toContain("Del remove");
    expect(contents).toContain("a add");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("removes one visible copy without promising to hide the remaining copy", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("copy", ["COPY"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    const layout = defaultLayout();
    layout.aboveEditor = [["widget:copy"], ["widget:copy"]];
    menu.drafts.current.value = layout;
    menu.drafts.push({ kind: "contents", region: "aboveEditor", row: 1, selected: 0 });
    const output = plain(menu.render(80));
    expect(output).toContain("Del remove");
    expect(output).not.toContain("Del hide");
    menu.handleInput(remove);
    expect(menu.drafts.layout().aboveEditor).toEqual([["widget:copy"], []]);
    expect(menu.drafts.layout().hidden).not.toContain("widget:copy");
    expect(plain(fixture.host.widgetContainerAbove.render(80))).toContain("COPY");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("clears saved feedback on edits and scope changes while retaining independent drafts", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["ONE"]);
  fixture.ui.setWidget("two", ["TWO"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.handleInput("\x13");
    expect(plain(menu.render(80))).toContain("Saved and applied");
    menu.handleInput("\t");
    expect(plain(menu.render(80))).not.toContain("Saved and applied");
    menu.handleInput("\t");
    menu.handleInput("\x13");
    menu.handleInput(enter);
    menu.handleInput("\x1b[1;2B");
    expect(menu.drafts.dirty).toBe(true);
    expect(plain(menu.render(80))).not.toContain("Saved and applied");
    menu.handleInput("\t");
    expect(menu.drafts.dirty).toBe(false);
    menu.handleInput("\x1b[Z");
    expect(menu.drafts.dirty).toBe(true);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("adds rows with a after new registrations and from an empty region without an action item", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("one", ["ONE"]);
  fixture.ui.setWidget("two", ["TWO"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.handleInput(enter);
    menu.handleInput(down);
    expect(plain(menu.render(80))).not.toContain("Add row");
    fixture.ui.setWidget("three", ["THREE"]);
    menu.handleInput("a");
    expect(menu.drafts.dirty).toBe(true);
    expect(menu.drafts.layout().aboveEditor).toEqual([
      ["widget:one"],
      ["widget:two"],
      ["widget:three"],
      []
    ]);
    expect(menu.drafts.view).toMatchObject({ kind: "contents", row: 3 });
    menu.handleInput(escape);
    for (let index = 0; index < 4; index++) menu.handleInput(remove);
    fixture.terminal.rows = 10;
    expect(menu.drafts.layout().aboveEditor).toEqual([]);
    expect(plain(menu.render(40))).toContain("No rows. Press a to add.");
    expect(plain(menu.render(40))).toContain("a add");
    menu.handleInput(enter);
    expect(menu.drafts.view).toMatchObject({ kind: "rows", selected: 0 });
    menu.handleInput("a");
    expect(menu.drafts.layout().aboveEditor).toEqual([[]]);
    expect(menu.drafts.view).toMatchObject({ kind: "contents", row: 0 });
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
    expect(text.length).toBeLessThanOrEqual(28 - coordinator.regionHeight(80));
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

it("indicates a clipped picker collection and unavailable widgets", async () => {
  const fixture = await hostFixture();
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.drafts.push({ kind: "picker", region: "footer", row: 0, selected: 0 });
    const layout = defaultLayout();
    layout.hidden = Array.from({ length: 30 }, (_, index) => `widget:hidden-${index}`);
    menu.drafts.current.value = layout;
    menu.drafts.view.selected = 14;
    fixture.terminal.rows = 24;
    const text = plain(menu.render(80));
    // separator, flex, 30 hidden widgets, then 6 visible built-ins offered as copies.
    expect(text).toContain("15/38");
    expect(text).toContain("unavailable");
    menu.drafts.view.selected = 37;
    const visible = plain(menu.render(80));
    // Row 1 holds cwd/git/title; row 2's built-ins can be copied into it.
    expect(visible).toMatch(/Working directory\s+Already in row/u);
    expect(visible).toContain("Model and thinking");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps save recovery inline on small terminals and retries without leaving the draft", async () => {
  const fixture = await hostFixture();
  const { settings, coordinator, menu, apply } = menuFor(fixture);

  try {
    settings.save("global", defaultLayout());
    menu.drafts.reset();
    const draft = structuredClone(menu.drafts.current.value);
    mkdirSync(`${settings.paths.global}.lock`);
    fixture.terminal.rows = 10;
    menu.handleInput("\x13");
    const failure = plain(menu.render(40));
    expect(failure).toContain("Draft retained");
    expect(failure).toContain("Check");
    expect(failure).toContain("Esc close");
    expect(failure).toContain("Ctrl+S save");
    expect(failure).toContain("Above editor");
    expect(menu.drafts.view.kind).toBe("root");
    expect(menu.drafts.current.value).toEqual(draft);
    expect(apply).not.toHaveBeenCalled();
    menu.handleInput("?");
    expect(plain(menu.render(40))).toBe(failure);
    expect(menu.drafts.current.value).toEqual(draft);
    rmdirSync(`${settings.paths.global}.lock`);
    menu.handleInput("\x13");
    expect(apply).toHaveBeenCalledOnce();
    expect(menu.drafts.dirty).toBe(false);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("keeps the selected status identity when new statuses sort ahead of it", async () => {
  const fixture = await hostFixture();
  fixture.ui.setStatus("middle", "MIDDLE");
  fixture.ui.setStatus("last", "LAST");
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.drafts.push({ kind: "contents", region: "footer", row: 2, selected: 2 });
    expect(plain(menu.render(80))).toContain("→ middle");
    fixture.ui.setStatus("first", "FIRST");
    menu.handleInput(remove);
    expect(menu.drafts.layout().hidden).toEqual(["status:middle"]);
    expect(menu.drafts.layout().footer[2]).toContain("status:first");
    expect(menu.drafts.layout().footer[2]).toContain("status:last");
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

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
      expect(menu.drafts.dirty).toBe(false);
      expect(menu.drafts.layout().aboveEditor).toEqual([["widget:second"]]);
      expect(menu.drafts.layout().belowEditor).toEqual([["widget:first"]]);
      expect(menu.drafts.view).toMatchObject({ kind: "rows", region: "aboveEditor" });
    } finally {
      coordinator.dispose();
      await fixture.dispose();
    }
  }
);

it("keeps empty-region controls usable after the selected native row moves away", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("only", ["ONLY"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    menu.handleInput(enter);
    menu.render(80);
    fixture.ui.setWidget("only", ["MOVED"], { placement: "belowEditor" });
    menu.handleInput(remove);
    expect(menu.drafts.dirty).toBe(false);
    expect(plain(menu.render(40))).toContain("No rows. Press a to add.");
    menu.handleInput("a");
    expect(menu.drafts.view).toMatchObject({ kind: "contents", row: 0 });
    expect(menu.drafts.layout().aboveEditor).toEqual([[]]);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

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
    menu.drafts.push({ kind: "contents", region: "footer", row: 2, selected: 1 });
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

it("retains selection between identical empty rows", async () => {
  const fixture = await hostFixture();
  const { coordinator, menu } = menuFor(fixture);

  try {
    const layout = defaultLayout();
    layout.aboveEditor = [[], []];
    menu.drafts.current.value = layout;
    menu.drafts.push({ kind: "rows", region: "aboveEditor", selected: 1 });
    menu.render(80);
    menu.render(40);
    menu.handleInput(enter);
    expect(menu.drafts.view).toMatchObject({ kind: "contents", row: 1 });
    menu.handleInput(escape);
    menu.handleInput("\x1b[A");
    menu.handleInput(enter); // Edit the first empty row instead.
    menu.handleInput("a");
    menu.handleInput(enter); // Add a separator.
    menu.handleInput(escape);
    menu.render(80);
    expect(menu.drafts.view).toMatchObject({ kind: "rows", selected: 0 });
    expect(menu.drafts.layout().aboveEditor).toEqual([["separator"], []]);
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});

it("bounds every nested view through resize, including wide labels", async () => {
  const fixture = await hostFixture();
  fixture.ui.setWidget("界👩‍💻 contributor", ["WIDE"]);
  const { coordinator, menu } = menuFor(fixture);

  try {
    const renderSizes = () => {
      for (const rows of [1, 3, 5, 10, 24])
        for (const width of [1, 20, 40, 80]) {
          fixture.terminal.rows = rows;
          const lines = menu.render(width);
          expect(lines.length).toBeLessThanOrEqual(Math.max(1, rows - 2));
          expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        }
    };

    renderSizes();
    for (let index = 0; index < 3; index++) menu.handleInput(down);
    renderSizes();

    for (const [width, rows] of [
      [40, 10],
      [80, 24]
    ] as const) {
      fixture.terminal.rows = rows;
      expect(plain(menu.render(width))).toContain("Reset to defaults");
    }

    for (let index = 0; index < 3; index++) menu.handleInput("\x1b[A");
    menu.handleInput(enter);
    renderSizes();
    menu.handleInput(enter);
    renderSizes();
    menu.handleInput("a");
    renderSizes();
  } finally {
    coordinator.dispose();
    await fixture.dispose();
  }
});
