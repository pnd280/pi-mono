import { Type } from "@earendil-works/pi-ai";
import { initTheme, type AgentToolResult, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import type { Outcome, ResultTextContext } from "../../contracts.ts";
import { selectAdapter } from "../../host/selection.ts";
import { loadDisplaySettings } from "../../settings.ts";
import {
  piSmartCompactAdapter,
  smartCompactDisplayAdapter as compact,
  contextWindowDisplayAdapter as contextWindow
} from "./index.ts";

const info: ToolInfo = {
  name: "compact",
  exposure: "model-only",
  description: "Compact the session context",
  parameters: Type.Object({ instructions: Type.Optional(Type.String()) }),
  sourceInfo: {
    path: "/workspace/packages/extensions/pi-smart-compact/index.ts",
    source: "local",
    scope: "user",
    origin: "package"
  }
};
const contextInfo: ToolInfo = {
  ...info,
  name: "context_window",
  exposure: "direct",
  parameters: Type.Object({})
};
const selection = {
  scheduled: true,
  modelOverride: "provider/nested/model-界",
  thinkingLevel: "high"
};
const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));
const content = (lines: string[]) => plain(lines).replace(/[├└│•\s]/g, "");

function result(details: unknown, text = "Compaction requested."): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function displayContext(
  details: unknown,
  overrides: Partial<ResultTextContext> = {}
): ResultTextContext {
  return {
    result: result(details),
    contentIndex: 0,
    isError: false,
    isPartial: false,
    isCancelled: false,
    expanded: true,
    ...overrides
  };
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
    invalidate() {}
  };
}

beforeAll(() => initTheme("dark", false));

it("selects only the owning extension's tool contracts and respects renderer overrides", () => {
  for (const [tool, adapterId] of [
    [info, "pi-smart-compact:compact"],
    [contextInfo, "pi-smart-compact:context_window"]
  ] as const) {
    for (const sourceInfo of [
      tool.sourceInfo,
      { ...tool.sourceInfo, path: "C:\\extensions\\pi-smart-compact\\src\\index.ts" },
      { ...tool.sourceInfo, path: "/cache/index.js", source: "npm:pi-smart-compact@0.1.0" }
    ])
      expect(piSmartCompactAdapter({ ...tool, sourceInfo })?.id).toBe(adapterId);

    for (const unsupported of [
      undefined,
      { ...tool, name: "other" },
      { ...tool, parameters: {} },
      { ...tool, parameters: Type.Object({ instructions: Type.String() }) },
      { ...tool, parameters: Type.Object({ instructions: Type.Optional(Type.Number()) }) },
      ...["builtin", "sdk"].map((source) => ({
        ...tool,
        sourceInfo: { ...tool.sourceInfo, source }
      })),
      { ...tool, sourceInfo: { ...tool.sourceInfo, path: "/extensions/other/index.ts" } }
    ])
      expect(piSmartCompactAdapter(unsupported)).toBeUndefined();

    const owner = { renderCall: () => ({ render: () => [], invalidate() {} }) };

    for (const [mode, expected] of [
      ["auto", adapterId],
      ["generic", "generic"],
      ["original", undefined]
    ] as const) {
      const settings = loadDisplaySettings([
        {
          path: "settings",
          settings: { "ext.pi-tool-display": { rendererOverrides: { [tool.name]: mode } } }
        }
      ]);
      expect(selectAdapter(settings, tool.name, owner, false, tool)?.id).toBe(expected);
    }
  }

  expect(piSmartCompactAdapter({ ...contextInfo, parameters: info.parameters })).toBeUndefined();
  expect(piSmartCompactAdapter({ ...info, parameters: contextInfo.parameters })).toBeUndefined();
});

it("uses only validated scheduling metadata and preserves other output", () => {
  const args = { instructions: "Preserve remaining tests." };
  const text = "Compaction requested.";
  const unchanged = [{ kind: "output", text }];
  expect(compact.textParts?.(text, args, displayContext(selection))).toEqual([
    { kind: "annotation", text: "Model: " },
    { kind: "value", text: "provider/nested/model-界:high" }
  ]);
  expect(compact.textParts?.(text, args, displayContext({ scheduled: true }))).toEqual([]);

  for (const details of [
    undefined,
    {},
    { ...selection, scheduled: false },
    { ...selection, modelOverride: "invalid" },
    { ...selection, thinkingLevel: undefined },
    { ...selection, thinkingLevel: "automatic" }
  ])
    expect(compact.textParts?.(text, args, displayContext(details))).toEqual(unchanged);
  for (const flags of [{ isPartial: true }, { isError: true }, { isCancelled: true }])
    expect(compact.textParts?.(text, args, displayContext(selection, flags))).toEqual(
      flags.isError ? [{ kind: "error", text }] : unchanged
    );
  const diagnostic = "pi-smart-compact: invalid or unreadable settings.";
  for (const isCancelled of [false, true])
    expect(
      compact.textParts?.(
        diagnostic,
        args,
        displayContext(undefined, { isError: true, isCancelled })
      )
    ).toEqual([{ kind: "error", text: diagnostic }]);
  const invalid = { model: "pretend/model" };
  expect(compact.supports?.(invalid, result(selection))).toBe(false);
  expect(compact.headingVerbs?.(invalid)).toBeUndefined();
  expect(compact.textParts?.(text, invalid, displayContext(selection))).toEqual(unchanged);
  const other = "Compaction could not be requested.";
  expect(compact.textParts?.(other, args, displayContext(selection))).toEqual([
    { kind: "output", text: other }
  ]);
});

it("omits absent focus and empty parameter punctuation", () => {
  for (const instructions of [undefined, null, "", "  "]) {
    const args = { instructions };
    expect(compact.supports?.(args, result({ scheduled: true }))).toBe(true);
    expect(compact.invocation?.(args).filter((part) => part.kind !== "parameters")).toEqual([
      { kind: "value", text: "compaction" }
    ]);
  }
});

it("renders compact request status, focus, and model without generic calls", () => {
  const args = { instructions: "Preserve unfinished tests." };
  const supplied = result(selection);
  const before = structuredClone({ args, supplied });

  for (const showParameters of [false, true]) {
    const context = renderContext(args, false);
    const renderers = createToolDisplayRenderers("compact", compact, { showParameters });
    const call = renderers.renderCall(args, theme, { ...context, isPartial: true });
    expect(plain(call.render(180))).toContain("Requesting compaction");
    const body = renderers.renderResult(supplied, context, theme, context);
    const heading = plain(call.render(180));
    expect(heading).toContain("Requested compaction \u2014 Preserve unfinished tests.");
    expect(heading).not.toContain("Called compact");
    expect(heading.includes(JSON.stringify(args))).toBe(showParameters);
    expect(plain(body.render(180))).toContain("Model: provider/nested/model-界:high");
    expect(plain(body.render(180))).not.toContain("Compaction requested.");

    for (const width of [18, 80]) {
      const narrow = content([...call.render(width), ...body.render(width)]);
      expect(narrow).toContain("Requestedcompaction");
      expect(narrow).toContain("Model:provider/nested/model-界:high");
      expect(narrow).not.toContain("Compactionrequested.");
    }

    const unconfigured = renderers.renderResult(
      result({ scheduled: true }),
      context,
      theme,
      context
    );
    expect(plain(unconfigured.render(180)).trim()).toBe("");
    expect(plain(call.render(180))).toContain("Requested compaction");
  }

  expect({ args, supplied }).toEqual(before);
});

it("formats supplied context facts without estimating unknown values or clamping overflow", () => {
  const summarize = (details: unknown, outcome: Outcome = "success") =>
    contextWindow.summary?.(result(details), {
      args: {},
      outcome,
      operation: undefined,
      expanded: false
    })?.text;
  expect(summarize({ tokens: 5963, contextWindow: 272000, percent: 2.1922794 })).toBe(
    "5,963 / 272,000 tokens · 2.19% used"
  );
  expect(summarize({ tokens: 0, contextWindow: 272000, percent: 0 })).toBe(
    "0 / 272,000 tokens · 0% used"
  );
  expect(summarize({ tokens: null, contextWindow: 272000, percent: null })).toBe(
    "Usage unknown · 272,000-token window"
  );
  expect(summarize({ tokens: 5963, contextWindow: 272000, percent: null })).toBe(
    "5,963 / 272,000 tokens"
  );
  const usage = { tokens: 12000, contextWindow: 10000, percent: 120 };
  expect(summarize(usage)).toBe("12,000 / 10,000 tokens · 120% used");
  for (const details of [
    undefined,
    {},
    { ...usage, tokens: -1 },
    { ...usage, contextWindow: 0 },
    { ...usage, percent: Infinity }
  ])
    expect(summarize(details)).toBeUndefined();
  for (const outcome of ["failure", "cancelled", "unavailable"] as const)
    expect(summarize(usage, outcome)).toBeUndefined();
  expect(contextWindow.supports?.({ unexpected: true }, result(usage))).toBe(false);
  expect(contextWindow.headingVerbs?.({ unexpected: true })).toBeUndefined();
});

it.each([false, true])(
  "renders context totals and restores raw data only on expansion (expanded: %s)",
  (expanded) => {
    const usage = { tokens: 5963, contextWindow: 272000, percent: 2.192279411764706 };
    const supplied = result(usage, JSON.stringify(usage));
    const before = structuredClone(supplied);
    const context = renderContext({}, expanded);
    const renderers = createToolDisplayRenderers("context_window", contextWindow);
    const call = renderers.renderCall({}, theme, { ...context, isPartial: true });
    expect(plain(call.render(120))).toContain("Checking context window");
    const body = renderers.renderResult(supplied, context, theme, context);
    const heading = plain(call.render(120));
    expect(heading).toContain("Checked context window");
    expect(heading).not.toContain("({})");
    const output = plain(body.render(120));
    expect(output).toContain("5,963 / 272,000 tokens · 2.19% used");
    expect(output.includes(JSON.stringify(usage))).toBe(expanded);

    for (const width of [18, 80]) {
      const narrow = content([...call.render(width), ...body.render(width)]);
      expect(narrow).toContain("5,963/272,000tokens");
      expect(narrow).toContain("2.19%used");
      expect(narrow.includes(JSON.stringify(usage).replace(/\s+/g, ""))).toBe(expanded);
    }

    const missing = result(undefined, "Context usage unavailable.");
    const unavailable = renderers.renderResult(missing, context, theme, context);
    expect(plain(unavailable.render(120))).toContain("Context usage unavailable.");
    expect(plain(unavailable.render(120))).not.toContain("5,963");
    expect(supplied).toEqual(before);
  }
);
