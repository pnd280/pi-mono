import { expect, it } from "vite-plus/test";

import { WidgetDrafts } from "./drafts.ts";
import { defaultLayout, layoutSchema } from "./layout.ts";

function drafts() {
  const global = defaultLayout();
  global.aboveEditor = [["widget:a", "separator", "widget:b"], ["widget:c"]];
  global.hidden = ["status:hidden", "widget:unavailable"];

  return new WidgetDrafts({ global, project: undefined, warnings: [] }, () => []);
}

function open(state: WidgetDrafts, id: string): void {
  const { choices, view } = state.snapshot();
  const target = choices.findIndex((choice) => choice.id === id);
  expect(target).toBeGreaterThanOrEqual(0);
  const delta = target - view.selected;
  for (let index = 0; index < Math.abs(delta); index++) state.navigate(delta > 0 ? "down" : "up");
  state.navigate("open");
}

it("deletes to hide, transfers by delete/re-add, and offers visible widgets as copies", () => {
  const state = drafts();
  open(state, "aboveEditor");
  open(state, "0");
  state.navigate("remove");
  expect(state.layout().hidden).toContain("widget:a");
  state.navigate("back");
  state.navigate("back");
  open(state, "belowEditor");
  state.navigate("add");
  state.navigate("add");
  const choices = state.snapshot().choices.map((choice) => choice.id);
  expect(choices.slice(0, 5)).toEqual([
    "separator",
    "flex",
    "status:hidden",
    "widget:unavailable",
    "widget:a"
  ]);
  expect(choices).toEqual(expect.arrayContaining(["widget:b", "widget:c", "builtin:model"]));
  open(state, "widget:a");
  expect(state.layout().belowEditor).toEqual([["widget:a"]]);
  expect(state.layout().hidden).not.toContain("widget:a");
  state.navigate("add");
  open(state, "widget:a");
  expect(state.view.kind).toBe("picker");
  expect(state.layout().belowEditor).toEqual([["widget:a"]]);
  expect(layoutSchema.safeParse(state.layout()).success).toBe(true);
});

it("duplicates visible widgets and hides only after removing the last copy", () => {
  const state = drafts();
  open(state, "belowEditor");
  state.navigate("add");
  state.navigate("add");
  open(state, "widget:b");
  state.navigate("add");
  open(state, "builtin:model");
  expect(state.layout().belowEditor).toEqual([["widget:b", "builtin:model"]]);
  expect(state.layout().aboveEditor[0]).toContain("widget:b");
  expect(layoutSchema.safeParse(state.layout()).success).toBe(true);
  state.navigate("back");
  expect(state.view.kind).toBe("rows");
  state.navigate("remove");
  expect(state.layout().belowEditor).toEqual([]);
  expect(state.layout().hidden).not.toContain("widget:b");
  expect(state.layout().hidden).not.toContain("builtin:model");
  state.navigate("back");
  open(state, "aboveEditor");
  open(state, "0");
  state.navigate("down");
  state.navigate("down");
  state.navigate("remove");
  expect(state.layout().hidden).toContain("widget:b");
  expect(layoutSchema.safeParse(state.layout()).success).toBe(true);
});

it("row removal hides only widgets; separators are repeatable, flex is unique", () => {
  const state = drafts();
  open(state, "aboveEditor");
  state.navigate("remove");
  expect(state.layout().hidden).toEqual([
    "status:hidden",
    "widget:unavailable",
    "widget:a",
    "widget:b"
  ]);
  expect(state.layout().aboveEditor).toEqual([["widget:c"]]);
  open(state, "0");
  state.navigate("add");
  open(state, "flex");
  state.navigate("add");
  open(state, "flex");
  expect(state.layout().aboveEditor).toEqual([["widget:c", "flex"]]);
  state.navigate("back");
  state.navigate("remove");
  expect(state.layout().hidden).not.toContain("flex");
  state.navigate("add");
  open(state, "separator");
  state.navigate("add");
  open(state, "separator");
  expect(state.layout().aboveEditor).toEqual([["widget:c", "separator", "separator"]]);
  expect(layoutSchema.safeParse(state.layout()).success).toBe(true);
});

it("reorders within boundaries and preserves parent selection and independent scope drafts", () => {
  const state = drafts();
  open(state, "aboveEditor");
  state.navigate("moveUp");
  expect(state.view.selected).toBe(0);
  state.navigate("moveDown");
  state.navigate("moveDown");
  expect(state.view.selected).toBe(1);
  expect(state.layout().aboveEditor).toEqual([["widget:c"], ["widget:a", "separator", "widget:b"]]);
  open(state, "1");
  state.navigate("down");
  state.navigate("moveUp");
  expect(state.layout().aboveEditor[1]).toEqual(["separator", "widget:a", "widget:b"]);
  state.navigate("switchScope");
  expect(state.layout().aboveEditor[0]).toEqual(["widget:a", "separator", "widget:b"]);
  open(state, "reset");
  state.navigate("switchScope");
  expect(state.view.kind).toBe("contents");
  state.navigate("back");
  expect(state.view.selected).toBe(1);
  state.navigate("back");
  expect(state.view.selected).toBe(0);
  open(state, "belowEditor");
  state.navigate("back");
  expect(state.view).toEqual({ kind: "root", selected: 1 });
  expect(state.navigate("back")).toBe("close");
});

it("keeps inherited project navigation anchored when a global save moves its row", () => {
  const state = drafts();
  state.navigate("switchScope");
  open(state, "aboveEditor");
  open(state, "0");
  state.navigate("down");
  state.navigate("down");
  state.navigate("switchScope");
  open(state, "aboveEditor");
  state.navigate("moveDown");
  state.saved({ global: state.current.value, project: undefined, warnings: [] });
  state.navigate("switchScope");
  expect(state.view).toMatchObject({ kind: "contents", row: 1, selected: 2 });
  state.navigate("remove");
  expect(state.layout().hidden).toContain("widget:b");
  expect(state.layout().aboveEditor).toEqual([["widget:c"], ["widget:a", "separator"]]);
});

it("returns an inherited view to its row list when a global save removes its target", () => {
  const state = drafts();
  state.navigate("switchScope");
  open(state, "aboveEditor");
  open(state, "0");
  state.navigate("switchScope");
  open(state, "aboveEditor");
  state.navigate("remove");
  state.saved({ global: state.current.value, project: undefined, warnings: [] });
  state.navigate("switchScope");
  expect(state.view).toMatchObject({ kind: "rows", region: "aboveEditor", selected: 0 });
  expect(state.current).toEqual({ value: undefined, saved: undefined });
});

it("stages explicit defaults without changing the saved project or global layout", () => {
  const global = defaultLayout();
  global.aboveEditor = [["widget:global"]];
  const project = defaultLayout();
  project.belowEditor = [["widget:project"]];
  const state = new WidgetDrafts({ global, project, warnings: [] }, () => []);
  expect(state.scope).toBe("project");
  open(state, "belowEditor");
  state.navigate("back");
  open(state, "reset");
  expect(state.current.value).toEqual(defaultLayout());
  expect(state.current.saved).toEqual(project);
  expect(state.view).toEqual({ kind: "root", selected: 0 });
  expect(state.layout().aboveEditor).toEqual([]);
  state.navigate("switchScope");
  expect(state.layout().aboveEditor).toEqual([["widget:global"]]);
});

it("reloads saved-global inheritance without replacing an independent global draft or baseline", () => {
  const state = drafts();
  const savedGlobal = structuredClone(state.current.saved);
  open(state, "aboveEditor");
  state.navigate("remove");
  const globalDraft = structuredClone(state.current.value);
  state.navigate("switchScope");
  const reloadedGlobal = defaultLayout();
  reloadedGlobal.aboveEditor = [["widget:external"]];
  state.saved({ global: reloadedGlobal, project: undefined, warnings: [] });
  expect(state.layout().aboveEditor).toEqual([["widget:external"]]);
  expect(state.current).toEqual({ value: undefined, saved: undefined });
  state.navigate("switchScope");
  expect(state.current).toEqual({ value: globalDraft, saved: savedGlobal });
  expect(state.layout().aboveEditor).toEqual([["widget:c"]]);
});

it("rebases inherited duplicate rows by occurrence and rejects partial matches after a save", () => {
  const global = defaultLayout();
  global.aboveEditor = [["widget:a"], ["widget:b"], ["widget:a"]];
  const state = new WidgetDrafts({ global, project: undefined, warnings: [] }, () => []);
  state.navigate("switchScope");
  open(state, "aboveEditor");
  open(state, "2");
  state.navigate("add");
  state.navigate("switchScope");
  const moved = defaultLayout();
  moved.aboveEditor = [["widget:a"], ["widget:a"], ["widget:b"]];
  state.saved({ global: moved, project: undefined, warnings: [] });
  state.navigate("switchScope");
  expect(state.view).toMatchObject({ kind: "picker", row: 1 });
  state.navigate("switchScope");
  const replaced = defaultLayout();
  replaced.aboveEditor = [["widget:a"], ["widget:a", "widget:b"]];
  state.saved({ global: replaced, project: undefined, warnings: [] });
  state.navigate("switchScope");
  expect(state.view).toMatchObject({ kind: "rows", selected: 1 });
  expect(state.current).toEqual({ value: undefined, saved: undefined });
});
