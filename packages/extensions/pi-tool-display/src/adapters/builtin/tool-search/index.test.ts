import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { plainTheme as theme } from "../../../test-fixture.ts";
import { toolSearchDisplayAdapter as adapter } from "./index.ts";

function result(loaded: unknown, text = "Loaded tools."): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: { loaded } };
}

function renderContext(args: unknown, expanded: boolean) {
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
    invalidate() {}
  };
}

beforeAll(() => initTheme("dark", false));

it("keeps search arguments and results unchanged while rendering", () => {
  const args = { query: "github issues" };
  const supplied = result(["gh_list"], "Loaded 1 tool. They are available from your next call:");
  const before = structuredClone({ args, supplied });

  for (const showParameters of [false, true]) {
    const context = renderContext(args, false);
    const renderers = createToolDisplayRenderers("tool_search", adapter, { showParameters });
    const call = renderers.renderCall(args, theme, { ...context, isPartial: true });
    call.render(180);
    renderers.renderResult(supplied, context, theme, context).render(180);
    call.render(180);

    const open = renderContext(args, true);
    renderers.renderResult(supplied, open, theme, open).render(180);
  }

  expect({ args, supplied }).toEqual(before);
});
