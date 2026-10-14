import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { plainTheme as theme } from "../../test-fixture.ts";
import {
  smartCompactDisplayAdapter as compact,
  contextWindowDisplayAdapter as contextWindow
} from "./index.ts";

const selection = {
  scheduled: true,
  modelOverride: "provider/nested/model-界",
  thinkingLevel: "high"
};

function result(details: unknown, text = "Compaction requested."): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
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

it("keeps compact request arguments and results unchanged while rendering", () => {
  const args = { instructions: "Preserve unfinished tests." };
  const supplied = result(selection);
  const before = structuredClone({ args, supplied });

  for (const showParameters of [false, true]) {
    const context = renderContext(args, false);
    const renderers = createToolDisplayRenderers("compact", compact, { showParameters });
    const call = renderers.renderCall(args, theme, { ...context, isPartial: true });
    call.render(180);
    const body = renderers.renderResult(supplied, context, theme, context);

    for (const width of [18, 80, 180]) {
      call.render(width);
      body.render(width);
    }
  }

  expect({ args, supplied }).toEqual(before);
});

it.each([false, true])(
  "keeps context usage results unchanged while rendering (expanded: %s)",
  (expanded) => {
    const usage = { tokens: 5963, contextWindow: 272000, percent: 2.192279411764706 };
    const supplied = result(usage, JSON.stringify(usage));
    const before = structuredClone(supplied);
    const context = renderContext({}, expanded);
    const renderers = createToolDisplayRenderers("context_window", contextWindow);
    const call = renderers.renderCall({}, theme, { ...context, isPartial: true });
    call.render(120);
    const body = renderers.renderResult(supplied, context, theme, context);

    for (const width of [18, 80, 120]) {
      call.render(width);
      body.render(width);
    }

    expect(supplied).toEqual(before);
  }
);
