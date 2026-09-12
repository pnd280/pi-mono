import { expect, it } from "vite-plus/test";

import { genericAdapter, nativeAdapter, selectAdapter } from "./adapters.ts";
import { loadDisplaySettings, SETTINGS_KEY } from "./settings.ts";
const source = (rendererOverrides: unknown, path = "global/settings.json") => ({
  path,
  settings: { [SETTINGS_KEY]: { rendererOverrides } }
});
it("merges exact tool names with project auto resets and empty-map inheritance", () => {
  const global = source({ read: "original", search: "generic", unavailable: "original" });
  expect(
    loadDisplaySettings([global, source({ read: "auto" }, "project/settings.json")])
  ).toMatchObject({
    valid: true,
    rendererOverrides: { read: "auto", search: "generic", unavailable: "original" }
  });
  expect(loadDisplaySettings([global, source({})]).rendererOverrides).toEqual(
    loadDisplaySettings([global]).rendererOverrides
  );
});
it("defaults parameters to hidden and merges explicit visibility independently of tool overrides", () => {
  const visibility = (showParameters: unknown, path = "global/settings.json") => ({
    path,
    settings: { [SETTINGS_KEY]: { showParameters } }
  });
  expect(loadDisplaySettings([])).toMatchObject({ valid: true, showParameters: false });
  const global = visibility(true);
  expect(loadDisplaySettings([global, source({ read: "generic" })])).toMatchObject({
    valid: true,
    showParameters: true,
    rendererOverrides: { read: "generic" }
  });
  expect(loadDisplaySettings([global, visibility(false, "project/settings.json")])).toMatchObject({
    valid: true,
    showParameters: false
  });
  for (const invalid of [null, "true", 0, [], {}]) {
    const settings = loadDisplaySettings([
      visibility(invalid),
      visibility(true, "project/settings.json")
    ]);
    expect(settings).toMatchObject({ valid: false, showParameters: false, rendererOverrides: {} });
    expect(settings.warnings).toEqual([
      expect.stringContaining("global/settings.json: invalid ext.pi-tool-display.showParameters")
    ]);
  }
});
it.each([false, [], null, "generic", { read: false }, { read: "special" }, { "": "auto" }])(
  "rejects invalid override maps as a whole: %j",
  (value) => {
    const settings = loadDisplaySettings([
      source(value),
      source({ read: "auto" }, "project/settings.json")
    ]);
    expect(settings.valid).toBe(false);
    expect(settings.rendererOverrides).toEqual({});
    expect(settings.warnings.join()).toContain(
      "global/settings.json: invalid ext.pi-tool-display.rendererOverrides"
    );
    expect(selectAdapter(settings, "read", undefined, true)).toBeUndefined();
  }
);
it.each([null, [], true, { other: {} }])("rejects invalid sections: %j", (section) => {
  expect(
    loadDisplaySettings([{ path: "settings.json", settings: { [SETTINGS_KEY]: section } }]).valid
  ).toBe(false);
});
it("preserves partial owner slots, distinguishes unknown built-in names, and opts out of capture", () => {
  const defaults = loadDisplaySettings([]);
  const renderer = () => ({ render: () => [], invalidate() {} });
  for (const owner of [{ renderCall: renderer }, { renderResult: renderer }]) {
    expect(selectAdapter(defaults, "read", owner, false)).toBeUndefined();
    expect(
      selectAdapter(loadDisplaySettings([source({ read: "generic" })]), "read", owner, true)
    ).toBe(genericAdapter);
  }
  expect(selectAdapter(defaults, "read", undefined, false)).toBe(genericAdapter);
  expect(selectAdapter(defaults, "read", undefined, true)?.family).toBe("read");
  expect(
    selectAdapter(loadDisplaySettings([source({ read: "original" })]), "read", undefined, true)
  ).toBeUndefined();
  expect(genericAdapter.patch).toBeUndefined();
  expect(genericAdapter.savedOutput).toBeUndefined();
  expect("exploration" in genericAdapter).toBe(false);
  expect(nativeAdapter("constructor")).toBeUndefined();
});
