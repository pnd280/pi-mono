import { createSyntheticSourceInfo, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import { genericAdapter, nativeAdapter } from "../adapters/index.ts";
import { mcpToolInfo } from "../adapters/pi-mcp-adapter/test-fixture.ts";
import { selectiveReadToolInfo } from "../adapters/pi-read/test-fixture.ts";
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

it("selects selective-read ahead of its owned renderers while respecting overrides", () => {
  const info = selectiveReadToolInfo();

  for (const [mode, expected] of [
    ["auto", "pi-read:read"],
    ["original", undefined],
    ["generic", "generic"]
  ] as const) {
    const settings = loadDisplaySettings([
      {
        path: "settings",
        settings: {
          "ext.pi-tool-display": { rendererOverrides: { read: mode } }
        }
      }
    ]);
    expect(selectAdapter(settings, "read", owner, false, info)?.id).toBe(expected);
  }

  expect(
    selectAdapter(loadDisplaySettings([]), "read", owner, false, {
      ...info,
      parameters: {}
    })
  ).toBeUndefined();
});

it.each(["codemode", "mcp", "mcp__docs"])(
  "retains builtin %s renderers instead of selecting the external MCP adapter",
  (name) => {
    const info = {
      ...mcpToolInfo(name),
      sourceInfo: createSyntheticSourceInfo(`builtin:${name}`, { source: "builtin" })
    };
    expect(selectAdapter(loadDisplaySettings([]), name, owner, false, info)).toBeUndefined();
  }
);

it("keeps generic fallbacks free of native observation capabilities", () => {
  expect(genericAdapter.patch).toBeUndefined();
  expect(genericAdapter.savedOutput).toBeUndefined();
  expect(genericAdapter.exploration?.({ path: "src/a.ts" })).toBeUndefined();
  expect(nativeAdapter("constructor")).toBeUndefined();
});
