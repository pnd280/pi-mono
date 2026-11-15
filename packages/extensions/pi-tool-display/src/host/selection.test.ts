import { expect, it } from "vite-plus/test";

import { mcpToolInfo } from "../adapters/pi-mcp-adapter/test-fixture.ts";
import { loadDisplaySettings } from "../settings.ts";
import { selectAdapter } from "./selection.ts";

const owner = { renderCall: () => ({ render: () => [], invalidate() {} }) };

it("applies exact-name renderer overrides before native and extension adapters", () => {
  for (const native of [false, true]) {
    for (const mode of ["auto", "original", "generic"] as const) {
      const settings = loadDisplaySettings([
        {
          path: "settings",
          settings: { "ext.pi-tool-display": { rendererOverrides: { grep: mode } } }
        }
      ]);
      const expected = {
        original: undefined,
        generic: "generic",
        auto: native ? "pi:grep" : "pi-mcp-adapter:direct"
      };
      const info = mcpToolInfo("grep");
      expect(selectAdapter({ settings, name: "grep", original: owner, native, info })?.id).toBe(
        expected[mode]
      );
    }

    const invalid = loadDisplaySettings([
      { path: "settings", settings: { "ext.pi-tool-display": { showParameters: "invalid" } } }
    ]);
    expect(
      selectAdapter({
        settings: invalid,
        name: "grep",
        original: owner,
        native,
        info: mcpToolInfo("grep")
      })
    ).toBeUndefined();
  }

  // Prototype-like names without an override keep automatic selection: a renderer slot stays (not generic), and a tool without one gets a generic card (not original).
  const overridden = loadDisplaySettings([
    {
      path: "settings",
      settings: { "ext.pi-tool-display": { rendererOverrides: { grep: "generic" } } }
    }
  ]);

  for (const name of ["toString", "constructor"]) {
    expect(
      selectAdapter({ settings: overridden, name, original: owner, native: false })
    ).toBeUndefined();
    expect(
      selectAdapter({ settings: overridden, name, original: undefined, native: false })?.id
    ).toBe("generic");
  }
});
