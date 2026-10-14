import { initTheme, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { createToolDisplayRenderers as createTranscriptRenderers } from "../../rendering/cards.ts";
import { plainTheme as theme } from "../../test-fixture.ts";
import { TranscriptCoordinator } from "../../transcript/coordinator.ts";
import { selectiveReadDisplayAdapter } from "./index.ts";

beforeAll(() => initTheme("dark", false));

it.each([
  { path: "example.txt", startLine: "1" },
  { path: "example.txt", limit: "3" },
  { path: "example.txt", selection: { startLine: 1, extra: null } }
])("keeps retained read arguments unchanged while rendering: %j", (args) => {
  const coordinator = new TranscriptCoordinator("read-arguments", { cwd: "/project" });
  const before = structuredClone(args);

  try {
    const call = coordinator.add(
      { messageTimestamp: 1, contentIndex: 0, toolCallId: "read" },
      "read",
      args,
      selectiveReadDisplayAdapter,
      "historical"
    );
    const result: AgentToolResult<unknown> = {
      content: [{ type: "text", text: "source" }],
      details: undefined
    };
    coordinator.result(call, result, "success");
    const context = {
      args,
      state: {},
      toolCallId: "read",
      cwd: "/project",
      lastComponent: undefined,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
      durationMs: undefined,
      outputPad: 1,
      invalidate() {}
    };
    const renderers = createTranscriptRenderers("read", selectiveReadDisplayAdapter, {
      binding: { call, coordinator }
    });
    renderers.renderCall(args, theme, context).render(120);
    expect(args).toEqual(before);
  } finally {
    coordinator.dispose();
  }
});

it("keeps a selected-source result unchanged through public cards", () => {
  const args = {
    path: "example.txt",
    startLine: "1",
    offset: 8,
    limit: 2,
    selection: { startLine: 9, startColumn: 2, endColumn: 3 }
  };
  const result: AgentToolResult<unknown> = {
    content: [
      {
        type: "text",
        text: "context\n\t界tail\n\n[9 more lines in file. Use offset=10 to continue.]"
      },
      { type: "text", text: "Selected source preview:\n界" }
    ],
    details: { selectiveRead: { sourceBlocks: 1 } }
  };
  const before = structuredClone(result);

  for (const expanded of [false, true]) {
    const context = {
      args,
      state: {},
      toolCallId: "selected",
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
    const renderers = createToolDisplayRenderers("read", selectiveReadDisplayAdapter);
    renderers.renderCall(args, theme, context).render(100);
    renderers.renderResult(result, context, theme, context).render(100);
  }

  expect(result).toEqual(before);
});
