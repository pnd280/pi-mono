import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { OrderSettingsView, type OrderSettingsOptions } from "./index.ts";

function fixture(overrides: Partial<OrderSettingsOptions> = {}) {
  const save = vi.fn(() => "Saved and applied.");
  const close = vi.fn();
  const options = {
    title: "Working message",
    items: [
      { id: "a", label: "Activity [todo]", description: "Working" },
      { id: "b", label: "Status [other]", description: "inactive" }
    ],
    scopes: [
      {
        id: "global",
        label: "global",
        destination: "/agent/settings.json",
        order: ["a", "missing", "b"]
      },
      {
        id: "project",
        label: "project",
        destination: "/project/.pi/settings.json",
        order: ["a", "missing", "b"]
      }
    ],
    initialScope: "global",
    theme: { fg: (_color, text) => text, bold: (text) => text },
    rows: () => 32,
    requestRender() {},
    save,
    close,
    ...overrides
  } satisfies OrderSettingsOptions;
  const view = new OrderSettingsView(options);

  return { view, save, close, output: () => view.render(100).join("\n") };
}

it("keeps reorders as drafts, follows the moved selection, and discards on close", () => {
  const { view, save, close, output } = fixture();
  expect(output()).toContain("inactive");
  expect(output()).toContain("unavailable");
  expect(output()).toMatch(/Activity \[todo\]\s+Working/);
  expect(output()).not.toContain("Activity [todo] · Working");
  expect(output()).not.toContain("Saved order");
  expect(output()).toContain("  Working message");
  expect(output()).toContain("  Scope: global | project");
  expect(output()).not.toContain("Project order overrides global");
  view.handleInput("\x1b[1;2A"); // boundary does not mark dirty
  expect(output()).not.toContain("Unsaved changes");
  view.handleInput("\x1b[1;2B");
  expect(output()).toContain("Unsaved changes");
  expect(save).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledOnce();
  view.handleInput("\x13");
  expect(save).not.toHaveBeenCalled();
});

it("renders scope tabs and switches in both directions", () => {
  const { view, output } = fixture({
    theme: {
      fg: (color, text) => `<${color}>${text}</${color}>`,
      bold: (text) => text
    }
  });
  expect(output()).toContain("<accent>global</accent>");
  expect(output()).toContain("<muted>project</muted>");
  view.handleInput("\t");
  expect(output()).toContain("<muted>global</muted>");
  expect(output()).toContain("<accent>project</accent>");
  view.handleInput("\x1b[Z");
  expect(output()).toContain("<accent>global</accent>");
  expect(output()).toContain("<muted>project</muted>");
});

it("saves only the selected scope and retains drafts and error state on failed save", () => {
  const { view, save, output } = fixture();
  view.handleInput("\x1b[B");
  view.handleInput("\x1b[1;2B");
  view.handleInput("\t");
  expect(output()).toContain("  Working message");
  expect(output()).toContain("  Scope: global | project");
  expect(output()).toContain("Settings file  /project/.pi/settings.json");
  expect(output()).toContain("Unsaved draft in other scope");
  view.handleInput("\x1b[1;2B");
  save.mockImplementationOnce(() => {
    throw new Error("Cannot save: locked");
  });
  view.handleInput("\x13");
  expect(output()).toContain("Cannot save: locked");
  expect(output()).toContain("Unsaved changes");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("project", ["missing", "a", "b"]);
  expect(output()).toContain("Saved and applied.");
  view.handleInput("\x1b[Z");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("global", ["a", "b", "missing"]);
});

it("bounds rows and widths, scrolls to selection, and refreshes text without losing the draft", () => {
  const { view, output } = fixture();
  view.handleInput("\x1b[1;2B");
  view.updateItems([
    { id: "a", label: "Activity [todo]", description: "New text" },
    { id: "c", label: "New", description: "inactive" }
  ]);
  expect(output()).toContain("New text");
  expect(output()).toContain("Unsaved changes");
  expect(output()).toMatch(/b\s+unavailable/);

  for (const width of [1, 20, 80]) {
    expect(view.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(view.render(width).length).toBeLessThanOrEqual(30);
  }

  const many = fixture({
    scopes: [
      {
        id: "global",
        label: "global",
        destination: "/settings.json",
        order: Array.from({ length: 30 }, (_, i) => `entry-${i}`)
      }
    ],
    items: [],
    rows: () => 24
  });
  many.view.handleInput("\x1b[A");
  expect(many.output()).toContain("entry-29");
  expect(many.view.render(80).length).toBeLessThanOrEqual(22);

  const compact = fixture({
    rows: () => 10,
    items: [
      { id: "a", label: "Activity [todo]", description: "Working" },
      { id: "b", label: "Status [other]", description: "inactive" },
      { id: "c", label: "New [other]", description: "inactive" }
    ]
  });
  const compactLines = compact.view.render(40);
  const compactOutput = compactLines.join("\n");
  expect(compactOutput).toContain("  Working message");
  expect(compactLines[2]?.trim()).toBe("");
  expect(compactOutput).toContain("  Scope: global | project");
  expect(compactOutput).toContain("Activity [todo]");
  expect(compactOutput).not.toContain("Working message · global");
  expect(compactOutput).not.toContain("Settings file");
  expect(compact.view.render(40).length).toBeLessThanOrEqual(8);
});
