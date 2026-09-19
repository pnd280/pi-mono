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
    note: "Changes apply only on save.",
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
  view.handleInput("\x1b[1;2A"); // boundary does not mark dirty
  expect(output()).not.toContain("Unsaved changes");
  view.handleInput("\x1b[1;2B");
  expect(output()).toContain("Unsaved changes · 2/3");
  expect(save).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledOnce();
  view.handleInput("\x13");
  expect(save).not.toHaveBeenCalled();
});

it("saves only the selected scope and retains drafts and error state on failed save", () => {
  const { view, save, output } = fixture();
  view.handleInput("\x1b[B");
  view.handleInput("\x1b[1;2B");
  view.handleInput("\t");
  expect(output()).toContain("Save to project:");
  expect(output()).toContain("unsaved draft in other scope");
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
  view.handleInput("\t");
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
  expect(output()).toContain("Unsaved changes · 2/4");
  expect(output()).toContain("b · unavailable");

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
});
