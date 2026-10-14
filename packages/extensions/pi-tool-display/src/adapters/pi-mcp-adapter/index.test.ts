import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { piMcpAdapter } from "./index.ts";
import { mcpToolInfo } from "./test-fixture.ts";

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
