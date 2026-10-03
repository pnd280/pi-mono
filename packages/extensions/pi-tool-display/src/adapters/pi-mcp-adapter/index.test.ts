import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { selectAdapter } from "../../host/selection.ts";
import { loadDisplaySettings } from "../../settings.ts";
import { piMcpAdapter } from "./index.ts";
import { mcpToolInfo } from "./test-fixture.ts";

it("selects owned gateway, script, namespace and arbitrary direct names before owner renderers", () => {
  const owner = { renderCall: () => ({ render: () => [], invalidate() {} }) };

  for (const [name, kind] of [
    ["mcp", "gateway"],
    ["mcpScript", "script"],
    ["mcp__docs", "namespace"],
    ["lookup", "direct"]
  ] as const) {
    const info = mcpToolInfo(name);
    expect(selectAdapter(loadDisplaySettings([]), name, owner, false, info)?.id).toBe(
      `pi-mcp-adapter:${kind}`
    );

    for (const mode of ["original", "generic"] as const) {
      const settings = loadDisplaySettings([
        {
          path: "settings",
          settings: {
            "ext.pi-tool-display": { rendererOverrides: { [name]: mode } }
          }
        }
      ]);
      expect(selectAdapter(settings, name, owner, false, info)?.id).toBe(
        mode === "generic" ? "generic" : undefined
      );
    }
  }
});

it("retains ordered published media without copying bytes or inferring flattened resources", () => {
  const adapter = piMcpAdapter(mcpToolInfo())!;
  const supplied: AgentToolResult<unknown> = {
    content: [
      { type: "text", text: "before" },
      { type: "image", mimeType: "image/png", data: "PRIVATE_IMAGE_BYTES" },
      { type: "text", text: "[Resource: file:///example]\nafter" }
    ],
    details: { mode: "call", server: "docs", tool: "search" }
  };
  expect(adapter.mcp?.({}, supplied)).toEqual({
    server: "docs",
    tool: "search",
    outcome: "success",
    content: [
      { type: "text", text: "before" },
      { type: "media", mimeType: "image/png" },
      { type: "text", text: "[Resource: file:///example]\nafter" }
    ]
  });
  expect(supplied.content[1]).toEqual({
    type: "image",
    mimeType: "image/png",
    data: "PRIVATE_IMAGE_BYTES"
  });
});
