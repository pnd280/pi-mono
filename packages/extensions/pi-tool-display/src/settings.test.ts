import { expect, it } from "vite-plus/test";

import { loadDisplaySettings, SETTINGS_KEY } from "./settings.ts";
const source = (rendererOverrides: unknown, path = "global/settings.json") => ({
  path,
  settings: { [SETTINGS_KEY]: { rendererOverrides } }
});
it("rejects invalid parameter visibility despite later replacement", () => {
  const visibility = (showParameters: unknown, path = "global/settings.json") => ({
    path,
    settings: { [SETTINGS_KEY]: { showParameters } }
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
it("rejects invalid collapsed modes despite later replacement", () => {
  const mode = (collapsedMode: unknown, path = "global/settings.json") => ({
    path,
    settings: { [SETTINGS_KEY]: { collapsedMode } }
  });

  for (const invalid of ["verbose", "expanded", true, null]) {
    const settings = loadDisplaySettings([mode(invalid), mode("compact", "project/settings.json")]);
    expect(settings).toMatchObject({
      valid: false,
      collapsedMode: "summary",
      rendererOverrides: {}
    });
    expect(settings.warnings).toEqual([
      expect.stringContaining("global/settings.json: invalid ext.pi-tool-display.collapsedMode")
    ]);
  }
});
it.each([[], null, { read: false }, { read: "special" }, { "": "auto" }])(
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
      collapsedMode: "summary",
      rendererOverrides: {},
      warnings: [
        "global/settings.json: invalid ext.pi-tool-display.rendererOverrides.read; keeping original rendering and disabling display observation."
      ]
    });
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

it.each([null, [], { other: {} }])("rejects invalid sections: %j", (section) => {
  expect(
    loadDisplaySettings([{ path: "settings.json", settings: { [SETTINGS_KEY]: section } }]).valid
  ).toBe(false);
});
