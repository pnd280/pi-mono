import { initTheme, type AgentToolResult, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { plainTheme as theme } from "../../../test-fixture.ts";
import { mcpToolDisplayAdapter as adapter } from "./index.ts";

// Mirrors Pi 1.0.1 `createMcpToolDefinition` for a server that omits `properties`.
const info: ToolInfo = {
  name: "mcp__exa__web_search_exa",
  exposure: "direct",
  namespace: { name: "mcp__exa", description: "Tools in the mcp__exa namespace." },
  description: "Search the web.",
  parameters: { type: "object", properties: {} },
  sourceInfo: { path: "builtin:mcp", source: "builtin", scope: "user", origin: "top-level" }
};

function result(details: unknown, text = "Title: Vite+ release notes"): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function renderContext(args: unknown, overrides: { isPartial?: boolean; isError?: boolean } = {}) {
  return {
    args,
    state: {},
    toolCallId: "fixture",
    cwd: "/project",
    lastComponent: undefined,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
    invalidate() {},
    ...overrides
  };
}

beforeAll(() => initTheme("dark", false));

it("keeps MCP arguments and results unchanged while rendering pending and completed calls", () => {
  const args = { query: "vite plus release notes" };
  const supplied = result({ server: "exa.ai", tool: "web.search" });
  const before = structuredClone({ args, supplied });
  const renderers = createToolDisplayRenderers(info.name, adapter, { showParameters: false });
  const context = renderContext(args);
  const call = renderers.renderCall(args, theme, { ...context, isPartial: true });
  call.render(180);
  renderers.renderResult(supplied, context, theme, context).render(180);
  call.render(180);
  expect({ args, supplied }).toEqual(before);
});

it("projects ordered media labels while leaving image bytes in Pi's result", () => {
  const supplied: AgentToolResult<unknown> = {
    content: [
      { type: "text", text: "before" },
      { type: "image", mimeType: "image/png", data: "PRIVATE_IMAGE_BYTES" },
      { type: "text", text: "after" }
    ],
    details: { server: "docs", tool: "search" }
  };
  const before = structuredClone(supplied);
  expect(adapter.mcp?.({}, supplied)?.content).toEqual([
    { type: "text", text: "before" },
    { type: "media", mimeType: "image/png" },
    { type: "text", text: "after" }
  ]);
  expect(supplied).toEqual(before);
});
