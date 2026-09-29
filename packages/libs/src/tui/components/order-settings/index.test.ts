import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { settingsSaveFeedback } from "../settings-menu/index.ts";
import { OrderSettingsView, type OrderSettingsOptions } from "./index.ts";

function fixture(overrides: Partial<OrderSettingsOptions> = {}) {
  const save = vi.fn(() => settingsSaveFeedback(false));
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
        isSet: true,
        order: ["a", "missing", "b"]
      },
      {
        id: "project",
        label: "project",
        destination: "/project/.pi/settings.json",
        isSet: true,
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

it("keeps the selected target, failed save and retry controls visible at 40x10", () => {
  const { view, save } = fixture({ rows: () => 10 });
  view.handleInput("\x1b[1;2B");
  save.mockImplementationOnce(() => {
    throw new Error("Check access, JSON, size and locks.");
  });
  view.handleInput("\x13");
  const lines = view.render(40);
  const output = lines.join("\n");
  expect(output).toContain("Activity [todo]");
  expect(output).toContain("Save failed. Draft retained.");
  expect(output).toContain("Ctrl+S save");
  expect(output).toContain("Esc close");
  expect(lines.length).toBeLessThanOrEqual(8);
  expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
});

it("stops selection at boundaries and does not hide save feedback on a no-op move", () => {
  const { view, output } = fixture();
  view.handleInput("\x1b[A");
  expect(output()).toContain("→ Activity [todo]");
  view.handleInput("\x13");
  view.handleInput("\x1b[1;2A");
  expect(output()).toContain("Saved and applied.");
});

it("does not save a reordered draft before or after close", () => {
  const { view, save, close } = fixture();
  view.handleInput("\x1b[1;2B");
  expect(save).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledOnce();
  view.handleInput("\x13");
  expect(save).not.toHaveBeenCalled();
});

it("marks unset scopes until their own save succeeds, even without reordering", () => {
  const { view, save, output } = fixture({
    scopes: ["global", "project"].map((id) => ({
      id,
      label: id,
      destination: `/${id}/settings.json`,
      isSet: false,
      inheritFrom: id === "global" ? "project" : "global",
      order: ["a", "b"]
    }))
  });
  expect(output()).toContain("Scope: global (not set) | project (not set)");
  expect(output()).not.toContain("Unsaved changes");
  view.handleInput("\t");
  view.handleInput("\x1b[B"); // Keep the selected item when the inherited order changes.
  view.handleInput("\t");
  view.handleInput("\x1b[1;2B");
  expect(output()).toContain("global* (not set)");
  expect(output()).toContain("Unsaved changes");
  save.mockImplementationOnce(() => {
    throw new Error("Cannot save: locked");
  });
  view.handleInput("\x13");
  expect(output()).toContain("Cannot save: locked");
  expect(output()).toContain("global* (not set)");
  view.handleInput("\t");
  expect(output().indexOf("Activity [todo]")).toBeLessThan(output().indexOf("Status [other]"));
  view.handleInput("\t");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("global", ["b", "a"]);
  expect(output()).toContain("Scope: global | project (not set)");
  view.handleInput("\t");
  expect(output()).not.toContain("Unsaved changes");
  expect(output()).toContain("→ Status [other]");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("project", ["b", "a"]);
  expect(output()).not.toContain("not set");
});

it.each(["global", "project"])(
  "inherits the other scope's saved order into an unset %s draft",
  (unsetScope) => {
    const { view, save, output } = fixture({
      initialScope: unsetScope,
      scopes: ["global", "project"].map((id) => ({
        id,
        label: id,
        destination: `/${id}/settings.json`,
        isSet: id !== unsetScope,
        inheritFrom: id === "global" ? "project" : "global",
        order: id === unsetScope ? [] : ["b", "missing", "a"]
      }))
    });
    expect(output()).toContain(`${unsetScope} (not set)`);
    expect(output().indexOf("Status [other]")).toBeLessThan(output().indexOf("Activity [todo]"));
    expect(output()).not.toContain("Unsaved changes");
    view.handleInput("\x13");
    expect(save).toHaveBeenLastCalledWith(unsetScope, ["b", "missing", "a"]);
  }
);

it("preserves an unset scope's edits when its inherited order changes", () => {
  const { view, save, output } = fixture({
    initialScope: "project",
    scopes: ["global", "project"].map((id) => ({
      id,
      label: id,
      destination: `/${id}/settings.json`,
      isSet: id === "global",
      inheritFrom: id === "global" ? "project" : "global",
      order: ["a", "missing", "b"]
    }))
  });
  view.handleInput("\x1b[1;2B"); // Project draft: missing, a, b.
  view.handleInput("\t");
  view.handleInput("\x1b[1;2B");
  view.handleInput("\x1b[1;2B"); // Global draft: missing, b, a.
  view.handleInput("\x13");
  view.handleInput("\t");
  expect(output()).toContain("project* (not set)");
  expect(output()).toContain("Unsaved changes");
  expect(output()).toContain("→ Activity [todo]");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("project", ["missing", "a", "b"]);
});

it("inherits saved source order during item updates without copying unsaved source edits", () => {
  const { view, save, output } = fixture({
    scopes: ["global", "project"].map((id) => ({
      id,
      label: id,
      destination: `/${id}/settings.json`,
      isSet: id === "global",
      inheritFrom: id === "global" ? "project" : "global",
      order: ["a", "b"]
    }))
  });
  view.handleInput("\x1b[1;2B");
  view.updateItems([
    { id: "a", label: "Activity [todo]", description: "Updated" },
    { id: "b", label: "Status [other]", description: "inactive" },
    { id: "c", label: "New", description: "inactive" }
  ]);
  view.handleInput("\t");
  expect(output()).toContain("Updated");
  expect(output()).not.toContain("Unsaved changes");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("project", ["a", "b", "c"]);
  view.handleInput("\t");
  expect(output()).toContain("Unsaved changes");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("global", ["b", "a", "c"]);
});

it("does not inherit over an explicit empty saved order", () => {
  const { view, save, output } = fixture({
    initialScope: "project",
    scopes: ["global", "project"].map((id) => ({
      id,
      label: id,
      destination: `/${id}/settings.json`,
      isSet: true,
      inheritFrom: id === "global" ? "project" : "global",
      order: id === "global" ? ["b", "a"] : []
    }))
  });
  expect(output()).not.toContain("not set");
  view.handleInput("\x13");
  expect(save).toHaveBeenLastCalledWith("project", ["a", "b"]);
});

it("saves only the selected scope and retains drafts and error state on failed save", () => {
  const { view, save, output } = fixture();
  view.handleInput("\x1b[B");
  view.handleInput("\x1b[1;2B");
  view.handleInput("\t");
  expect(output()).toContain("  Working message");
  expect(output()).toContain("Scope: global* | project");
  expect(output()).toContain("Settings: /project/.pi/settings.json");
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

it("scrolls to selection and refreshes text without losing the draft", () => {
  const { view, output } = fixture();
  view.handleInput("\x1b[1;2B");
  view.updateItems([
    { id: "a", label: "Activity [todo]", description: "New text" },
    { id: "c", label: "New", description: "inactive" }
  ]);
  expect(output()).toContain("New text");
  expect(output()).toContain("Unsaved changes");
  expect(output()).toMatch(/b\s+unavailable/);

  const many = fixture({
    scopes: [
      {
        id: "global",
        label: "global",
        destination: "/settings.json",
        isSet: true,
        order: Array.from({ length: 30 }, (_, i) => `entry-${i}`)
      }
    ],
    items: [],
    rows: () => 24
  });
  for (let index = 0; index < 29; index++) many.view.handleInput("\x1b[B");
  expect(many.output()).toContain("entry-29");
  expect(many.view.render(80).length).toBeLessThanOrEqual(22);
});
