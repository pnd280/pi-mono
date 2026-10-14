import {
  initTheme,
  type AgentToolResult,
  type CodemodeToolDetails
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { plainTheme as theme } from "../../../test-fixture.ts";
import { codemodeDisplayAdapter as adapter } from "./index.ts";

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
    durationMs: undefined,
    outputPad: 1,
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

it("keeps codemode arguments unchanged while rendering compact and expanded cards", () => {
  const before = structuredClone(args);
  const supplied = result({ calls }, [
    { type: "text", text: HEADER },
    { type: "text", text: "distinct-result-body" }
  ]);
  render(supplied, false);
  render(supplied, true);
  expect(args).toEqual(before);
});
