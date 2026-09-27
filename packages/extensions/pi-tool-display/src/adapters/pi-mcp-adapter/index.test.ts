import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { selectAdapter } from "../../host/selection.ts";
import { createToolDisplayRenderers } from "../../rendering/api.ts";
import { loadDisplaySettings } from "../../settings.ts";
import { resolveResultAdapter } from "../generic.ts";
import { piMcpAdapter } from "./index.ts";
import { mcpToolInfo } from "./test-fixture.ts";

const result = (details: unknown): AgentToolResult<unknown> => ({
  content: [{ type: "text", text: "published output" }],
  details
});
const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  getBgAnsi: () => ""
};
const context = () => ({
  lastComponent: undefined,
  toolCallId: "mcp-1",
  cwd: "/tmp",
  args: {},
  state: {},
  invalidate() {},
  executionStarted: true,
  argsComplete: true,
  isPartial: false,
  expanded: false,
  showImages: false,
  isError: false
});

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

it("rejects lookalike owners, SDK tools and incompatible schemas", () => {
  const info = mcpToolInfo();

  for (const source of ["sdk", "builtin", "npm:pi-mcp-adapter-fork", "npm:other"]) {
    expect(
      piMcpAdapter({
        ...info,
        sourceInfo: {
          ...info.sourceInfo,
          source,
          path: source === "sdk" || source === "builtin" ? info.sourceInfo.path : "/other/index.ts"
        }
      })
    ).toBeUndefined();
  }

  expect(piMcpAdapter(undefined)).toBeUndefined();
  for (const name of ["mcp", "mcpScript", "mcp__docs"])
    expect(
      piMcpAdapter({ ...mcpToolInfo(name), parameters: { type: "object", properties: {} } })
    ).toBeUndefined();
  expect(
    piMcpAdapter({
      ...info,
      sourceInfo: {
        ...info.sourceInfo,
        source: "cli",
        path: "C:\\agent\\node_modules\\pi-mcp-adapter\\index.ts"
      }
    })?.id
  ).toBe("pi-mcp-adapter:gateway");
});

it("shows gateway parameters while retaining routing summaries and action precedence", () => {
  const adapter = piMcpAdapter(mcpToolInfo())!;
  const renderer = createToolDisplayRenderers("mcp", adapter);

  for (const [args, title] of [
    [{}, "mcp status"],
    [{ search: "", server: "docs" }, 'mcp search ""'],
    [{ instructions: "docs" }, "mcp instructions docs"],
    [{ connect: "docs", search: "ignored" }, "mcp connect docs"],
    [
      { action: "install", url: "https://example.test/mcp", tool: "ignored" },
      "mcp install https://example.test/mcp"
    ],
    [{ tool: "search", server: "docs", args: { query: "needle" } }, "docs.search"]
  ] as const) {
    const rows = renderer.renderCall(args, theme, context()).render(240).join("\n");
    const parameters = "args" in args ? args.args : args;
    expect(rows).toContain(`${title}(${JSON.stringify(parameters)})`);
  }
});

it.each([
  ["mcp", { tool: "search", args: { query: "needle" } }, 'mcp.search({"query":"needle"})'],
  [
    "mcp__docs",
    { tool: "search", args: { query: "needle" } },
    'mcp__docs.search({"query":"needle"})'
  ],
  ["lookup", { query: "needle" }, 'lookup({"query":"needle"})'],
  ["mcpScript", { code: 'emit("needle");' }, 'mcpScript({"code":"emit(\\"needle\\");"})']
])("always shows %s parameters regardless of settings or expansion", (name, args, invocation) => {
  const adapter = piMcpAdapter(mcpToolInfo(name))!;

  for (const options of [{}, { showParameters: false }, { showParameters: true }]) {
    const renderer = createToolDisplayRenderers(name, adapter, options);

    for (const expanded of [false, true]) {
      const current = { ...context(), expanded };
      const rows = renderer.renderCall(args, theme, current).render(120).join("\n");
      expect(rows).toContain(invocation);
    }
  }
});

it("bounds long script parameters until expansion and caches serialization between redraws", () => {
  const serialize = vi.fn(() => ({ code: `START ${"x".repeat(100 * 1024)} END` }));
  const args = { toJSON: serialize };
  const renderer = createToolDisplayRenderers("mcpScript", piMcpAdapter(mcpToolInfo("mcpScript")), {
    showParameters: false
  });
  const header = renderer.renderCall(args, theme, context());
  const collapsed = header.render(80).join("\n");
  expect(collapsed).toContain('"code":"START');
  expect(collapsed).toContain("more details");
  expect(collapsed).not.toContain("END");
  for (let redraw = 0; redraw < 20; redraw++) header.render(80);
  expect(serialize.mock.calls.length).toBeLessThan(3);

  const expanded = renderer
    .renderCall(args, theme, { ...context(), expanded: true })
    .render(80)
    .join("\n");
  expect(expanded).toContain('END"})');
  expect(expanded).not.toContain("more details");
});

it("uses resolved result identity with visible parameters and never substitutes raw MCP output", () => {
  const adapter = piMcpAdapter(mcpToolInfo())!;
  const args = { tool: "docs_search", args: '{ "query": "needle" }' };
  const supplied = result({
    mode: "call",
    server: "docs",
    tool: "search",
    mcpResult: { content: [{ type: "text", text: "PRIVATE_RAW_OUTPUT" }] }
  });
  const renderer = createToolDisplayRenderers("mcp", adapter, { showParameters: false });
  const current = context();
  const header = renderer.renderCall(args, theme, current);
  const body = renderer.renderResult(supplied, current, theme, current);
  expect(header.render(120).join("\n")).toContain("docs.search");
  expect(header.render(120).join("\n")).toContain(`(${JSON.stringify(args.args)})`);
  expect(body.render(120).join("\n")).toContain("published output");
  expect(body.render(120).join("\n")).not.toContain("PRIVATE_RAW_OUTPUT");
});

it("accepts gateway metadata results and retains published middleware failures", () => {
  const adapter = piMcpAdapter(mcpToolInfo())!;
  for (const [args, details] of [
    [
      { describe: "display_echo" },
      { mode: "describe", server: "display", tool: { originalName: "echo" } }
    ],
    [{ connect: "display" }, { mode: "list", server: "display", tools: ["display_echo"] }]
  ])
    expect(resolveResultAdapter(adapter, args, result(details))).toBe(adapter);
  const renderer = createToolDisplayRenderers("mcp", adapter);
  const current = { ...context(), isError: true };
  const supplied = result({ mode: "call", server: "display", tool: "echo" });
  expect(renderer.renderResult(supplied, current, theme, current).render(120).join("\n")).toContain(
    "published output"
  );
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
      { type: "media", mimeType: "image/png", contentIndex: 1 },
      { type: "text", text: "[Resource: file:///example]\nafter" }
    ]
  });
});

it("distinguishes returned errors without claiming a caught failure is a transport error", () => {
  const adapter = piMcpAdapter(mcpToolInfo())!;
  const identity = { mode: "call", server: "docs", tool: "search" };
  expect(adapter.mcp?.({}, result({ ...identity, error: "tool_error" }))?.outcome).toBe(
    "returned-error"
  );

  for (const error of ["call_failed", "auth_required", "aborted", "approval_denied"]) {
    expect(adapter.mcp?.({}, result({ ...identity, error }))).toBeUndefined();
    expect(adapter.notices?.(result({ ...identity, error }), false)).toEqual([
      { kind: error === "call_failed" ? "error" : "warning", text: `MCP: ${error}` }
    ]);
  }

  expect(adapter.mcp?.({}, result({}))).toBeUndefined();
});

it.each([
  ["mcp", "aborted", "Call cancelled", "warning"],
  ["mcp__docs", "aborted", "Call cancelled", "warning"],
  ["lookup", "aborted", "Call cancelled", "warning"],
  ["mcpScript", "aborted", "Call cancelled", "warning"],
  ["mcpScript", "script_error", "Call failed", "error"],
  ["mcpScript", "timeout", "Call failed", "error"]
])(
  "renders %s %s as a terminal outcome even without Pi's error flag",
  (name, error, verb, color) => {
    const renderer = createToolDisplayRenderers(name, piMcpAdapter(mcpToolInfo(name)));
    const colored = {
      ...theme,
      fg: (token: string, text: string) => `<${token}>${text}</${token}>`
    };
    const supplied = result({
      mode: name === "mcpScript" ? "script" : "call",
      server: "docs",
      tool: "search",
      error
    });

    for (const expanded of [false, true]) {
      const current = { ...context(), expanded };
      const header = renderer.renderCall({}, colored, current);
      const body = renderer.renderResult(supplied, current, colored, current);
      expect(header.render(160).join("\n")).toContain(`<error>•</error>`);
      expect(header.render(160).join("\n")).toContain(verb);
      expect(body.render(160).join("\n")).toContain(`<${color}>published output</${color}>`);
      expect(body.render(160).join("\n")).toContain(`<${color}>MCP: ${error}</${color}>`);
    }
  }
);

it("falls back for missing or malformed retained contracts without adding observation", () => {
  const adapter = piMcpAdapter(mcpToolInfo())!;
  for (const details of [
    undefined,
    {},
    { mode: "call", server: 4 },
    { mode: "future" },
    { error: true }
  ])
    expect(resolveResultAdapter(adapter, { tool: "search" }, result(details)).id).toBe("generic");
  expect(
    resolveResultAdapter(
      adapter,
      { tool: "search" },
      result({ mode: "call", server: "docs", tool: "search" })
    )
  ).toBe(adapter);
  expect(resolveResultAdapter(adapter, { tool: 5 }, result({ mode: "call" })).id).toBe("generic");
  expect(adapter.savedOutput).toBeUndefined();
  expect(adapter.patch).toBeUndefined();
  expect("exploration" in adapter).toBe(false);
});

it("summarizes only validated script operations and preserves output without successful operations", () => {
  const adapter = piMcpAdapter(mcpToolInfo("mcpScript"))!;
  const summary = (details: unknown) =>
    adapter.summary?.(result(details), {
      args: {},
      outcome: "success",
      operation: undefined,
      expanded: false
    });
  expect(
    summary({
      mode: "script",
      calls: [
        { operation: "call", ok: true },
        { operation: "search", ok: true },
        { operation: "describe", ok: true }
      ]
    })
  ).toEqual({ text: "3 MCP operations succeeded", preserveOutput: false });
  expect(summary({ mode: "script" })).toEqual({ text: "0 MCP operations", preserveOutput: true });
  expect(summary({ mode: "script", calls: [] })).toEqual({
    text: "0 MCP operations",
    preserveOutput: true
  });
  for (const details of [
    { mode: "call", calls: [] },
    { mode: "script", calls: "invalid" },
    { mode: "script", calls: [{ ok: true }] },
    { mode: "script", calls: [{ operation: "call", ok: "true" }] },
    { mode: "script", calls: [{ operation: "future", ok: true }] }
  ])
    expect(summary(details)).toBeUndefined();
});

it("exposes bounded-output references and script failures without dumping details", () => {
  const adapter = piMcpAdapter(mcpToolInfo("mcpScript"))!;
  const supplied = result({
    mode: "script",
    calls: [{ ok: true }, { ok: false }],
    outputGuard: { truncated: true, fullOutputPath: "/tmp/output.txt" },
    mcpResult: { omitted: true, fullResultPath: "/tmp/result.json", meta: "PRIVATE_METADATA" }
  });
  expect(adapter.notices?.(supplied, false)).toEqual([
    { kind: "warning", text: "MCP output truncated." },
    { kind: "reference", label: "Saved output", value: "/tmp/output.txt" },
    { kind: "warning", text: "1 MCP script operation failed." }
  ]);
  expect(adapter.notices?.(supplied, true)).toContainEqual({
    kind: "reference",
    label: "Saved MCP result",
    value: "/tmp/result.json"
  });
  expect(JSON.stringify(adapter.notices?.(supplied, true))).not.toContain("PRIVATE_METADATA");
});

it("counts every MCP call once in the MCP summary category", () => {
  const adapter = piMcpAdapter(mcpToolInfo("mcp"))!;
  const context = { result: undefined, change: undefined, cwd: "/work" };
  expect(adapter.summaryItems?.({ tool: "search" }, context)).toEqual([{ category: "mcp" }]);
  expect(adapter.summaryItems?.(undefined, context)).toEqual([{ category: "mcp" }]);
});
