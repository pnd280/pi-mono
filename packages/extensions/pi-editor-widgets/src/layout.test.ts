import { expect, it } from "vite-plus/test";

import { defaultLayout, layoutSchema, resolveLayout } from "./layout.ts";

it("keeps each native default on its own row, with sorted statuses in a trailing footer row", () => {
  const resolved = resolveLayout(undefined, [
    { id: "widget:a", region: "aboveEditor" },
    { id: "widget:b", region: "aboveEditor" },
    { id: "widget:c", region: "belowEditor" },
    { id: "status:z", region: "footer" },
    { id: "status:a", region: "footer" }
  ]);
  expect(resolved.aboveEditor).toEqual([["widget:a"], ["widget:b"]]);
  expect(resolved.belowEditor).toEqual([["widget:c"]]);
  expect(resolved.footer.at(-1)).toEqual(["status:a", "separator", "status:z"]);
});

it("retains unknown identities and hiding, without suppressing future unlisted registrations", () => {
  const saved = defaultLayout();
  saved.aboveEditor = [["widget:future", "flex", "status:elsewhere"]];
  saved.hidden = ["widget:hide"];
  const result = resolveLayout(saved, [
    { id: "widget:hide", region: "belowEditor" },
    { id: "widget:new", region: "belowEditor" },
    { id: "status:elsewhere", region: "footer" }
  ]);
  expect(result.aboveEditor).toEqual(saved.aboveEditor);
  expect(result.belowEditor).toEqual([["widget:new"]]);
  expect(result.hidden).toEqual(["widget:hide"]);
  expect(result.footer.flat()).not.toContain("status:elsewhere");
});

it("retains exact native keys, including empty and control-containing keys", () => {
  const layout = defaultLayout();
  layout.aboveEditor = [["widget:", "status:", "widget:key\nwith newline"]];
  expect(layoutSchema.parse(layout)).toEqual(layout);
});

it("rejects the entire layout for in-row or hidden duplicates, duplicate flex, unknown fields, and invalid namespaces", () => {
  const layout = defaultLayout();
  for (const patch of [
    { hidden: ["builtin:cwd"] },
    { aboveEditor: [["widget:a", "widget:a"]] },
    { aboveEditor: [["widget:a"]], hidden: ["widget:a"] },
    { aboveEditor: [["flex", "widget:a", "flex"]] },
    { aboveEditor: [["arbitrary"]] },
    { hidden: ["widget:a", "widget:a"] },
    { width: 20 }
  ])
    expect(layoutSchema.safeParse({ ...layout, ...patch }).success).toBe(false);
  expect(
    layoutSchema.safeParse({
      ...layout,
      aboveEditor: [["widget:same", "separator", "status:same", "separator", "separator"]]
    }).success
  ).toBe(true);
});

it("allows duplicating widgets, statuses, and built-ins across rows and regions", () => {
  const layout = defaultLayout();
  layout.aboveEditor = [["widget:a", "status:s", "builtin:cwd"], ["widget:a"]];
  layout.belowEditor = [["status:s", "builtin:model"]];
  expect(layoutSchema.parse(layout)).toEqual(layout);
  const resolved = resolveLayout(layout, [
    { id: "widget:a", region: "aboveEditor" },
    { id: "status:s", region: "footer" }
  ]);
  expect(resolved.aboveEditor).toEqual(layout.aboveEditor);
  expect(resolved.footer).toEqual(layout.footer);
});
