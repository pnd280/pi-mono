import { Type } from "@earendil-works/pi-ai";
import { initTheme, type AgentToolResult, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { selectAdapter } from "../../host/selection.ts";
import { loadDisplaySettings } from "../../settings.ts";
import { plainTheme as theme } from "../../test-fixture.ts";
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
const plain = (lines: string[]) => stripTerminalSequences(lines.join("\n"));
const content = (lines: string[]) => plain(lines).replace(/[├└│•\s]/g, "");

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
