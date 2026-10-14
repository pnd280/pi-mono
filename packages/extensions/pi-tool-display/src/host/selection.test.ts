import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
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

it("selects verified extension contracts before owner slots and otherwise preserves either slot", () => {
  const settings = loadDisplaySettings([]);
  const renderers: Pick<ToolDefinition, "renderCall" | "renderResult">[] = [
    owner,
    { renderResult: () => ({ render: () => [], invalidate() {} }) }
  ];

  for (const original of renderers) {
    expect(selectAdapter(settings, "ffgrep", original, false, fffToolInfo("ffgrep"))?.id).toBe(
      "@ff-labs/pi-fff:grep"
    );

    for (const info of [
      undefined,
      { ...fffToolInfo("ffgrep"), parameters: {} },
      {
        ...fffToolInfo("ffgrep"),
        sourceInfo: { ...fffToolInfo("ffgrep").sourceInfo, source: "sdk" }
      }
    ]) {
      expect(selectAdapter(settings, "ffgrep", original, false, info)).toBeUndefined();
      expect(selectAdapter(settings, "ffgrep", undefined, false, info)?.id).toBe("generic");
    }
  }

  expect(selectAdapter(settings, "read", undefined, false)?.id).toBe("generic");
  expect(selectAdapter(settings, "read", owner, true)?.id).toBe("pi:read");
  expect(selectAdapter(settings, "unknown", undefined, true)?.id).toBe("generic");
});
