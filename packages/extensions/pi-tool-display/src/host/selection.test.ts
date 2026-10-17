import { expect, it } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import { loadDisplaySettings } from "../settings.ts";
import { selectAdapter } from "./selection.ts";

const owner = { renderCall: () => ({ render: () => [], invalidate() {} }) };

it("applies renderer overrides before native and extension adapters", () => {
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
        auto: native ? "pi:grep" : "@ff-labs/pi-fff:grep"
      };
      expect(selectAdapter(settings, "grep", owner, native, fffToolInfo("grep"))?.id).toBe(
        expected[mode]
      );
    }

    const invalid = loadDisplaySettings([
      { path: "settings", settings: { "ext.pi-tool-display": { showParameters: "invalid" } } }
    ]);
    expect(selectAdapter(invalid, "grep", owner, native, fffToolInfo("grep"))).toBeUndefined();
  }
});
