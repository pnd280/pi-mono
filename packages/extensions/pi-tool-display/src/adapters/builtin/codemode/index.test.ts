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
import { plainTheme as theme } from "../../../test-fixture.ts";
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
