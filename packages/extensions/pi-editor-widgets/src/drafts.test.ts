import { expect, it } from "vite-plus/test";

import { WidgetDrafts } from "./drafts.ts";
import { defaultLayout, layoutSchema } from "./layout.ts";

function drafts() {
  const global = defaultLayout();
  global.aboveEditor = [["widget:a", "separator", "widget:b"], ["widget:c"]];
  global.hidden = ["status:hidden", "widget:unavailable"];

  return new WidgetDrafts({ global, project: undefined, warnings: [] }, () => []);
}

it("deletes to hide, transfers by delete/re-add, and excludes visible widgets from the direct picker", () => {
  const state = drafts();
  state.push({ kind: "contents", region: "aboveEditor", row: 0, selected: 0 });
  state.remove();
  expect(state.layout().hidden).toContain("widget:a");
  state.back();
  state.push({ kind: "rows", region: "belowEditor", selected: 0 });
  state.addRow("belowEditor");
  state.push({ kind: "picker", region: "belowEditor", row: 0, selected: 0 });
  expect(state.picker()).toEqual([
    "separator",
    "flex",
    "status:hidden",
    "widget:unavailable",
    "widget:a"
  ]);
  state.add("widget:a");
  expect(state.layout().belowEditor).toEqual([["widget:a"]]);
  expect(state.layout().hidden).not.toContain("widget:a");
  state.push({ kind: "picker", region: "belowEditor", row: 0, selected: 0 });
  state.add("widget:b");
  expect(state.layout().belowEditor).toEqual([["widget:a"]]);
  expect(layoutSchema.safeParse(state.layout()).success).toBe(true);
});

it("row removal hides only widgets; separators are repeatable, flex is unique", () => {
  const state = drafts();
  state.push({ kind: "rows", region: "aboveEditor", selected: 0 });
  state.remove();
  expect(state.layout().hidden).toEqual([
    "status:hidden",
    "widget:unavailable",
    "widget:a",
    "widget:b"
  ]);
  expect(state.layout().aboveEditor).toEqual([["widget:c"]]);
  state.push({ kind: "picker", region: "aboveEditor", row: 0, selected: 0 });
  state.add("flex");
  state.push({ kind: "picker", region: "aboveEditor", row: 0, selected: 0 });
  state.add("flex");
  expect(state.layout().aboveEditor).toEqual([["widget:c", "flex"]]);
  state.back();
  state.push({ kind: "contents", region: "aboveEditor", row: 0, selected: 1 });
  state.remove();
  expect(state.layout().hidden).not.toContain("flex");
});

it("reorders within boundaries and preserves parent selection and independent scope drafts", () => {
  const state = drafts();
  state.view.selected = 2;
  state.push({ kind: "rows", region: "aboveEditor", selected: 0 });
  state.move(-1);
  expect(state.view.selected).toBe(0);
  state.move(1);
  state.move(1);
  expect(state.view.selected).toBe(1);
  expect(state.layout().aboveEditor).toEqual([["widget:c"], ["widget:a", "separator", "widget:b"]]);
  state.push({ kind: "contents", region: "aboveEditor", row: 1, selected: 1 });
  state.move(-1);
  expect(state.layout().aboveEditor[1]).toEqual(["separator", "widget:a", "widget:b"]);
  state.scope = "project";
  expect(state.layout().aboveEditor[0]).toEqual(["widget:a", "separator", "widget:b"]);
  state.reset();
  state.scope = "global";
  expect(state.view.kind).toBe("contents");
  state.back();
  expect(state.view.selected).toBe(1);
  state.back();
  expect(state.view.selected).toBe(2);
  expect(state.back()).toBe(false);
});

it("keeps inherited project navigation anchored when a global save moves its row", () => {
  const state = drafts();
  state.scope = "project";
  state.push({ kind: "rows", region: "aboveEditor", selected: 0 });
  state.push({ kind: "contents", region: "aboveEditor", row: 0, selected: 2 });
  state.scope = "global";
  state.push({ kind: "rows", region: "aboveEditor", selected: 0 });
  state.move(1);
  state.saved({ global: state.current.value, project: undefined, warnings: [] });
  state.scope = "project";
  expect(state.view).toMatchObject({ kind: "contents", row: 1, selected: 2 });
  state.remove();
  expect(state.layout().hidden).toContain("widget:b");
  expect(state.layout().aboveEditor).toEqual([["widget:c"], ["widget:a", "separator"]]);
});

it("returns an inherited view to its row list when a global save removes its target", () => {
  const state = drafts();
  state.scope = "project";
  state.push({ kind: "rows", region: "aboveEditor", selected: 0 });
  state.push({ kind: "contents", region: "aboveEditor", row: 0, selected: 0 });
  state.scope = "global";
  state.push({ kind: "rows", region: "aboveEditor", selected: 0 });
  state.remove();
  state.saved({ global: state.current.value, project: undefined, warnings: [] });
  state.scope = "project";
  expect(state.view).toMatchObject({ kind: "rows", region: "aboveEditor", selected: 0 });
  expect(state.dirty).toBe(false);
});

it("stages explicit defaults without changing the saved project or global layout", () => {
  const global = defaultLayout();
  global.aboveEditor = [["widget:global"]];
  const project = defaultLayout();
  project.belowEditor = [["widget:project"]];
  const state = new WidgetDrafts({ global, project, warnings: [] }, () => []);
  expect(state.scope).toBe("project");
  state.push({ kind: "rows", region: "belowEditor", selected: 0 });
  state.reset();
  expect(state.current.value).toEqual(defaultLayout());
  expect(state.current.saved).toEqual(project);
  expect(state.view).toEqual({ kind: "root", selected: 0 });
  expect(state.dirty).toBe(true);
  expect(state.layout().aboveEditor).toEqual([]);
  state.scope = "global";
  expect(state.layout().aboveEditor).toEqual([["widget:global"]]);
});
