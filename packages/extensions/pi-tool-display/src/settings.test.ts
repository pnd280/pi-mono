import { expect, it } from "vite-plus/test";

import { selectAdapter } from "./host/selection.ts";
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
it.each(['{"toString":"generic"}', '[{"toString":null}]'])(
  "rejects non-string JSON overrides without coercion despite later replacement: %s",
  (json) => {
    const sources = [
      {
        path: "global/settings.json",
        settings: JSON.parse(
          `{"ext.pi-tool-display":{"showParameters":true,"rendererOverrides":{"read":${json},"write":"generic"}}}`
        ) as unknown
      },
      source({ read: "auto" }, "project/settings.json")
    ];
    const supplied = structuredClone(sources);
    const settings = loadDisplaySettings(sources);
    expect(settings).toEqual({
      valid: false,
      showParameters: false,
      rendererOverrides: {},
      warnings: [
        "global/settings.json: invalid ext.pi-tool-display.rendererOverrides.read; keeping original rendering and disabling display observation."
      ]
    });
    expect(selectAdapter(settings, "read", undefined, true)).toBeUndefined();
    expect(selectAdapter(settings, "write", undefined, true)).toBeUndefined();
    expect(sources).toEqual(supplied);
  }
);
it("treats prototype-like renderer names as exact keys and validates their values", () => {
  const overrides: unknown = JSON.parse(
    '{"__proto__":"generic","constructor":"original","toString":"auto"}'
  );
  const settings = loadDisplaySettings([source(overrides)]);
  expect(settings.valid).toBe(true);
  expect(Object.keys(settings.rendererOverrides).sort()).toEqual([
    "__proto__",
    "constructor",
    "toString"
  ]);
  expect(settings.rendererOverrides.__proto__).toBe("generic");
  const invalid: unknown = JSON.parse('{"__proto__":false}');
  expect(loadDisplaySettings([source(invalid)])).toMatchObject({
    valid: false,
    rendererOverrides: {}
  });
});

it.each([null, [], true, { other: {} }])("rejects invalid sections: %j", (section) => {
  expect(
    loadDisplaySettings([{ path: "settings.json", settings: { [SETTINGS_KEY]: section } }]).valid
  ).toBe(false);
});
