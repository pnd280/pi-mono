import {
  initTheme,
  type AgentToolResult,
  type CodemodeToolDetails,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { assert, beforeAll, expect, it } from "vite-plus/test";

import type { ToolDisplayAdapter } from "../../../contracts.ts";
import { keybindingHints, plainTheme as theme } from "../../../test-fixture.ts";
import { builtinCodemodeAdapter } from "./index.ts";

// Passes the built-in `codemode` provenance and schema checks.
const info: ToolInfo = {
  name: "codemode",
  exposure: "direct",
  description: "Run JavaScript that calls other tools.",
  parameters: { type: "object", required: ["code"], properties: { code: { type: "string" } } },
  sourceInfo: { path: "builtin:codemode", source: "builtin", scope: "user", origin: "top-level" }
};
const HEADER = "Script completed\nWall time 0.1 seconds\nOutput:\n";
const code = [
  'await tools.read({ path: "nested.txt" });',
  "",
  'const result = await tools.bash({ command: "printf nested-output" });',
  "text(result.output);"
].join("\n");
const args = { code };

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

function renderContext(expanded: boolean) {
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
    durationMs: undefined,
    outputPad: 1,
    ...keybindingHints,
    invalidate() {}
  };
}

function render(
  adapter: ToolDisplayAdapter,
  supplied: AgentToolResult<unknown>,
  expanded: boolean
) {
  const renderers = createToolDisplayRenderers("codemode", adapter);
  const context = renderContext(expanded);
  const call = renderers.renderCall(args, theme, context);
  const body = renderers.renderResult(supplied, context, theme, context);
  call.render(120);
  body.render(120);
}

beforeAll(() => initTheme("dark", false));

it("keeps codemode arguments and results unchanged while rendering compact and expanded cards", () => {
  const adapter = builtinCodemodeAdapter(info);
  assert(adapter, "the built-in codemode adapter matches");
  const before = structuredClone(args);
  const supplied: AgentToolResult<unknown> = {
    content: [
      { type: "text", text: HEADER },
      { type: "text", text: "distinct-result-body" }
    ],
    details: { calls } satisfies CodemodeToolDetails
  };
  const suppliedBefore = structuredClone(supplied);
  render(adapter, supplied, false);
  render(adapter, supplied, true);
  expect(args).toEqual(before);
  expect(supplied).toEqual(suppliedBefore);
});
