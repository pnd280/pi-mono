import { initTheme, type AgentToolResult, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { selectAdapter } from "../../../host/selection.ts";
import { loadDisplaySettings } from "../../../settings.ts";
import { builtinMcpAdapter, mcpToolDisplayAdapter as adapter } from "./index.ts";

// Mirrors Pi 1.0.0 `createMcpToolDefinition` for a server that omits `properties`.
const info: ToolInfo = {
  name: "mcp__exa__web_search_exa",
  exposure: "direct",
  namespace: { name: "mcp__exa", description: "Tools in the mcp__exa namespace." },
  description: "Search the web.",
  parameters: { type: "object", properties: {} },
  sourceInfo: { path: "builtin:mcp", source: "builtin", scope: "user", origin: "top-level" }
};
const { namespace: _namespace, ...unnamespaced } = info;
const resourceTool: ToolInfo = {
  ...unnamespaced,
  name: "read_mcp_resource",
  parameters: {
    type: "object",
    properties: { server: { type: "string" }, uri: { type: "string" } },
    required: ["server", "uri"]
  }
};
const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));

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

it("selects built-in MCP server tools before Pi's renderers and respects overrides", () => {
  expect(builtinMcpAdapter(info)?.id).toBe("builtin:mcp");
  const renderers = { renderCall: () => ({ render: () => [], invalidate() {} }) };
  const settings = (mode?: string) =>
    loadDisplaySettings([
      {
        path: "settings",
        settings: {
          "ext.pi-tool-display": mode ? { rendererOverrides: { [info.name]: mode } } : {}
        }
      }
    ]);
  expect(selectAdapter(settings(), info.name, renderers, false, info)?.id).toBe("builtin:mcp");
  expect(selectAdapter(settings("generic"), info.name, renderers, false, info)?.id).toBe("generic");
  expect(selectAdapter(settings("original"), info.name, renderers, false, info)).toBeUndefined();

  for (const unsupported of [
    undefined,
    resourceTool,
    { ...info, name: "web_search_exa" },
    { ...info, namespace: { name: "exa", description: "" } },
    { ...info, parameters: { type: "object" } },
    { ...info, sourceInfo: { ...info.sourceInfo, path: "builtin:tool-search" } },
    { ...info, sourceInfo: { ...info.sourceInfo, source: "sdk", path: "<sdk:mcp>" } },
    { ...info, sourceInfo: { ...info.sourceInfo, source: "local", path: "/ext/mcp/index.ts" } }
  ])
    expect(builtinMcpAdapter(unsupported)).toBeUndefined();
});

it("accepts Pi's details or none, and rejects other shapes", () => {
  const args = { query: "vite" };
  expect(adapter.supports?.(args, result({ server: "exa", tool: "web_search_exa" }))).toBe(true);
  expect(adapter.supports?.(args, result(undefined, "connection closed"))).toBe(true);
  for (const details of [{}, { server: "exa" }, { server: "", tool: "x" }, "exa"])
    expect(adapter.supports?.(args, result(details))).toBe(false);
  expect(adapter.supports?.("vite", result(undefined))).toBe(false);
});

it("shows the Pi name while pending and the unsanitized identity with arguments afterward", () => {
  const args = { query: "vite plus release notes" };
  const supplied = result({ server: "exa.ai", tool: "web.search" });
  const before = structuredClone({ args, supplied });
  const renderers = createToolDisplayRenderers(info.name, adapter, { showParameters: false });
  const context = renderContext(args);
  const call = renderers.renderCall(args, theme, { ...context, isPartial: true });
  expect(plain(call.render(180))).toContain(`mcp__exa__web_search_exa(${JSON.stringify(args)})`);

  const body = renderers.renderResult(supplied, context, theme, context);
  expect(plain(call.render(180))).toContain(`exa.ai.web.search(${JSON.stringify(args)})`);
  expect(plain(body.render(180))).toContain("Title: Vite+ release notes");
  expect({ args, supplied }).toEqual(before);
});

it("retains the resolved identity when a successful MCP result has no content", () => {
  const args = { query: "vite" };
  const supplied: AgentToolResult<unknown> = {
    content: [],
    details: { server: "exa.ai", tool: "web.search" }
  };
  const renderers = createToolDisplayRenderers(info.name, adapter);
  const context = renderContext(args);
  const call = renderers.renderCall(args, theme, context);
  renderers.renderResult(supplied, context, theme, context);

  expect(plain(call.render(180))).toContain('exa.ai.web.search({"query":"vite"})');
  expect(adapter.mcp?.(args, supplied)).toEqual({
    server: "exa.ai",
    tool: "web.search",
    outcome: "success",
    content: []
  });
});

it("keeps Pi's error flag and plain previews for calls without details", () => {
  const args = { query: "vite" };
  const renderers = createToolDisplayRenderers(info.name, adapter, { showParameters: false });
  const context = renderContext(args, { isError: true });
  const call = renderers.renderCall(args, theme, context);
  const body = renderers.renderResult(
    result(undefined, "MCP error: closed"),
    context,
    theme,
    context
  );
  expect(plain(call.render(180))).toContain("mcp__exa__web_search_exa");
  expect(plain(call.render(180))).toMatch(/failed/i);
  expect(plain(body.render(180))).toContain("MCP error: closed");
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

it("reports truncation only from a saved-output path and counts calls as MCP", () => {
  const identity = { server: "exa", tool: "web_search_exa" };
  expect(adapter.notices?.(result(identity), false)).toEqual([]);
  expect(adapter.notices?.(result(undefined), false)).toEqual([]);
  expect(
    adapter.notices?.(
      result({ ...identity }, "Warning: truncated output (original token count: 9)"),
      false
    )
  ).toEqual([]);
  // Pi's limitMcpContent includes the saved path in its retained text envelope.
  const truncated = result(
    { ...identity, fullOutputPath: "/tmp/pi-mcp-1.txt" },
    "Warning: truncated output (original token count: 9000)\nTotal output lines: 3\n\nhead…100 chars truncated…tail\n\n[Full output: /tmp/pi-mcp-1.txt (read it with offset/limit)]"
  );
  expect(adapter.notices?.(truncated, false)).toEqual([
    { kind: "warning", text: "MCP output truncated." },
    { kind: "reference", label: "Saved output", value: "/tmp/pi-mcp-1.txt" }
  ]);
  const renderers = createToolDisplayRenderers(info.name, adapter);
  const context = { ...renderContext({}), expanded: true };
  const expanded = plain(renderers.renderResult(truncated, context, theme, context).render(180));
  expect(expanded).toContain("Warning: truncated output");
  expect(expanded.split("/tmp/pi-mcp-1.txt")).toHaveLength(2);
  expect(
    adapter.summaryItems?.({}, { result: undefined, change: undefined, cwd: "/project" })
  ).toEqual([{ category: "mcp" }]);
});
