import { expect, it } from "vite-plus/test";

import { WidgetDrafts } from "./drafts.ts";
import { defaultLayout } from "./layout.ts";

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
  state.navigate("back");
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
