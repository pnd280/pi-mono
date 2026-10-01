import {
  createCodemodeExtension,
  initTheme,
  type AgentToolResult,
  type CodemodeToolDetails,
  type ExtensionAPI,
  type ToolDefinition,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { selectAdapter } from "../../../host/selection.ts";
import { loadDisplaySettings } from "../../../settings.ts";
import { builtinCodemodeAdapter, codemodeDisplayAdapter as adapter } from "./index.ts";

type Registered = Pick<ToolDefinition, "name" | "description" | "parameters">;

function registeredDefinition(): Registered {
  let definition: Registered | undefined;
  const pi = {
    registerTool(tool: Registered) {
      definition = tool;
    }
  } satisfies Pick<ExtensionAPI, "registerTool">;
  // The codemode factory only registers its tool; other host APIs run lazily.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  void createCodemodeExtension()(pi as unknown as ExtensionAPI);
  if (!definition) throw new Error("codemode was not registered");

  return definition;
}

const definition = registeredDefinition();
const info: ToolInfo = {
  name: definition.name,
  exposure: "model-only",
  description: definition.description,
  parameters: definition.parameters,
  sourceInfo: {
    path: "builtin:codemode",
    source: "builtin",
    scope: "temporary",
    origin: "top-level"
  }
};
const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));
const HEADER = "Script completed\nWall time 0.1 seconds\nOutput:\n";
const code = [
  'await tools.read({ path: "nested.txt" });',
  "",
  'const result = await tools.bash({ command: "printf nested-output" });',
  "text(result.output);"
].join("\n");
const args = { code };

function result(
  details: CodemodeToolDetails,
  content: AgentToolResult<unknown>["content"] = [
    { type: "text", text: HEADER },
    { type: "text", text: "nested-output" }
  ]
): AgentToolResult<unknown> {
  return { content, details };
}

const calls: CodemodeToolDetails["calls"] = [
  { id: "p/1", name: "read", args: '{"path":"nested.txt"}', status: "ok", durationMs: 4 },
  {
    id: "p/2",
    name: "bash",
    args: '{"command":"printf nested-output"}',
    status: "error",
    durationMs: 1500,
    error: "first line\nsecond line"
  }
];

function renderContext(
  expanded: boolean,
  overrides: { isPartial?: boolean; isError?: boolean } = {}
) {
  return {
    args,
    state: {},
    toolCallId: "fixture",
    cwd: "/project",
    lastComponent: undefined,
    executionStarted: true,
    argsComplete: true,
    isPartial: false,
    expanded,
    showImages: false,
    isError: false,
    invalidate() {},
    ...overrides
  };
}

function render(
  supplied: AgentToolResult<unknown>,
  expanded: boolean,
  overrides: { isPartial?: boolean; isError?: boolean } = {}
) {
  const renderers = createToolDisplayRenderers("codemode", adapter);
  const context = renderContext(expanded, overrides);
  const call = renderers.renderCall(args, theme, context);
  const body = renderers.renderResult(supplied, context, theme, context);

  return { heading: plain(call.render(120)), body: plain(body.render(120)) };
}

beforeAll(() => initTheme("dark", false));

it("selects only Pi's built-in codemode registration and respects renderer overrides", () => {
  expect(builtinCodemodeAdapter(info)?.id).toBe("builtin:codemode");

  for (const unsupported of [
    undefined,
    { ...info, name: "script" },
    { ...info, parameters: {} },
    { ...info, parameters: { ...definition.parameters, required: [] } },
    { ...info, sourceInfo: { ...info.sourceInfo, source: "inline", path: "<inline:1>" } },
    { ...info, sourceInfo: { ...info.sourceInfo, path: "builtin:mcp" } },
    { ...info, sourceInfo: { ...info.sourceInfo, source: "local", path: "/ext/codemode/index.ts" } }
  ])
    expect(builtinCodemodeAdapter(unsupported)).toBeUndefined();

  for (const [mode, expected] of [
    ["auto", adapter.id],
    ["generic", "generic"],
    ["original", undefined]
  ] as const) {
    const settings = loadDisplaySettings([
      {
        path: "settings",
        settings: { "ext.pi-tool-display": { rendererOverrides: { codemode: mode } } }
      }
    ]);
    expect(selectAdapter(settings, "codemode", undefined, false, info)?.id).toBe(expected);
  }
});

it("reads nested calls and the script category only from validated details", () => {
  expect(adapter.supports?.(args, result({ calls: [] }))).toBe(true);
  for (const unsupported of [{}, { code: 1 }, { code: "", extra: true }])
    expect(adapter.supports?.(unsupported, result({ calls: [] }))).toBe(false);

  expect(adapter.nestedCalls?.(result({ calls }))).toEqual([
    { name: "read", args: '{"path":"nested.txt"}', status: "success", durationMs: 4 },
    {
      name: "bash",
      args: '{"command":"printf nested-output"}',
      status: "failure",
      durationMs: 1500,
      error: "first line\nsecond line"
    }
  ]);
  for (const details of [undefined, {}, { calls: [{ name: "read" }] }])
    expect(adapter.nestedCalls?.({ content: [], details })).toBeUndefined();

  expect(adapter.summaryItems?.(args, { result: undefined, change: undefined, cwd: "/" })).toEqual([
    { category: "scripts" }
  ]);
});

it("renders the script as code and lists nested calls before the output", () => {
  const before = structuredClone(args);
  const supplied = result({ calls }, [
    { type: "text", text: HEADER },
    { type: "text", text: "distinct-result-body" }
  ]);
  const compact = render(supplied, false);
  expect(compact.heading).toContain("• Ran script");
  for (const line of code.split("\n").filter(Boolean)) expect(compact.heading).toContain(line);
  expect(compact.body).toContain('✓ read {"path":"nested.txt"} 4ms');
  expect(compact.body).toContain('✗ bash {"command":"printf nested-output"} 1.5s');
  expect(compact.body).toContain("distinct-result-body");
  expect(compact.body.indexOf("✓ read")).toBeLessThan(compact.body.indexOf("✗ bash"));
  expect(compact.body.indexOf("✗ bash")).toBeLessThan(compact.body.indexOf("distinct-result-body"));
  expect(compact.body).not.toContain("Script completed");

  const expanded = render(supplied, true);
  expect(expanded.heading.startsWith("▾ Ran script")).toBe(true);
  expect(expanded.body).toContain("first line");
  expect(expanded.body).toContain("second line");
  expect(args).toEqual(before);
});

it("retains unrecognized first blocks and later header lookalikes as script output", () => {
  for (const blocks of [[`${HEADER}user output`], [HEADER, HEADER]]) {
    const supplied = result(
      { calls: [] },
      blocks.map((text) => ({ type: "text", text }))
    );

    for (const expanded of [false, true]) {
      const body = render(supplied, expanded).body;
      expect(body).toContain("Script completed");
      expect(body).toContain("Wall time 0.1 seconds");
      if (blocks.length === 1) expect(body).toContain("user output");
    }
  }
});

it("keeps the latest calls compact, totals model costs, and names the full output", () => {
  const many = Array.from({ length: 10 }, (_, index) => ({
    id: `p/${index}`,
    name: "classify",
    args: `{"index":${index}}`,
    status: "ok" as const,
    cost: 0.004
  }));
  const supplied = result({ calls: many, fullOutputPath: "/tmp/codemode-output.txt" });
  const compact = render(supplied, false).body;
  expect(compact).toContain("… 2 earlier calls");
  expect(compact).not.toContain('{"index":1}');
  expect(compact).toContain('{"index":9} $0.0040');
  expect(compact).toContain("Model calls: $0.04");
  expect(compact).toContain("Full output: /tmp/codemode-output.txt");

  const expanded = render(supplied, true).body;
  expect(expanded).toContain('{"index":0}');
  expect(expanded).not.toContain("Full output:");
});

it("previews output from separate text() calls within one compact budget", () => {
  const blocks = ["a", "b", "c"].map((name) => ({
    type: "text" as const,
    text: Array.from({ length: 8 }, (_, index) => `${name}${index}`).join("\n")
  }));
  const supplied = result({ calls: [] }, [{ type: "text", text: HEADER }, ...blocks]);

  const compact = render(supplied, false).body.split("\n");
  expect(compact).toHaveLength(10);
  expect(compact.filter((row) => row.includes("more rows"))).toEqual([
    expect.stringContaining("… 15 more rows")
  ]);
  expect(compact[0]).toContain("a0");
  expect(compact.at(-1)).toContain("c7");

  const expanded = render(supplied, true).body;
  for (const row of ["a7", "b0", "b7", "c0"]) expect(expanded).toContain(row);
});

it("shows live calls while running and failures with Pi's error output", () => {
  const running = render(
    result({ calls: [{ id: "p/?", name: "write", args: "{}", status: "running" }] }, []),
    false,
    { isPartial: true }
  );
  expect(running.heading.split("\n")[0]).toBe("• Running script");
  expect(running.body).toContain("… write {}");

  const failed = render(
    result({ calls: calls.slice(1) }, [
      { type: "text", text: "Script failed\nWall time 0.2 seconds\nOutput:\n" },
      { type: "text", text: "Script error:\nError: first line" }
    ]),
    false,
    { isError: true }
  );
  expect(failed.heading.split("\n")[0]).toBe("• Script failed");
  expect(failed.body).toContain("Script error:");
  expect(failed.body).not.toContain("Wall time");
});

it("previews long scripts and hides them only behind the expansion hint", () => {
  const long = { code: Array.from({ length: 14 }, (_, index) => `text("${index}");`).join("\n") };
  const renderers = createToolDisplayRenderers("codemode", adapter);
  const rows = (expanded: boolean) =>
    plain(
      renderers.renderCall(long, theme, { ...renderContext(expanded), args: long }).render(120)
    );
  expect(rows(false)).toContain('text("9");');
  expect(rows(false)).not.toContain('text("10");');
  expect(rows(false)).toContain("… 4 more rows");
  expect(rows(true)).toContain('text("13");');
});
