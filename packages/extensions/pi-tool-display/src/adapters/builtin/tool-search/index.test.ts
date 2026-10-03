import {
  createToolSearchExtension,
  initTheme,
  type AgentToolResult,
  type ExtensionAPI,
  type ToolDefinition,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";
import { beforeAll, expect, it } from "vite-plus/test";

import { selectAdapter } from "../../../host/selection.ts";
import { loadDisplaySettings } from "../../../settings.ts";
import { builtinToolSearchAdapter, toolSearchDisplayAdapter as adapter } from "./index.ts";

type Registered = Pick<ToolDefinition, "name" | "description" | "parameters">;

function registeredDefinition(): Registered {
  let definition: Registered | undefined;
  const pi = {
    registerTool(tool: Registered) {
      definition = tool;
    }
  } satisfies Pick<ExtensionAPI, "registerTool">;
  // The tool-search factory only registers its tool; other host APIs are unused.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  void createToolSearchExtension()(pi as unknown as ExtensionAPI);
  if (!definition) throw new Error("tool_search was not registered");

  return definition;
}

const definition = registeredDefinition();
const info: ToolInfo = {
  name: definition.name,
  exposure: "model-only",
  description: definition.description,
  parameters: definition.parameters,
  sourceInfo: {
    path: "builtin:tool-search",
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
    invalidate() {}
  };
}

beforeAll(() => initTheme("dark", false));

it("selects only Pi's built-in tool_search registration and respects renderer overrides", () => {
  expect(builtinToolSearchAdapter(info)?.id).toBe("builtin:tool-search");

  for (const unsupported of [
    undefined,
    { ...info, name: "search_tools" },
    { ...info, parameters: {} },
    { ...info, parameters: { ...definition.parameters, required: [] } },
    { ...info, sourceInfo: { ...info.sourceInfo, source: "inline", path: "<inline:1>" } },
    { ...info, sourceInfo: { ...info.sourceInfo, path: "builtin:mcp" } },
    {
      ...info,
      sourceInfo: { ...info.sourceInfo, source: "local", path: "/ext/tool-search/index.ts" }
    }
  ])
    expect(builtinToolSearchAdapter(unsupported)).toBeUndefined();

  for (const [mode, expected] of [
    ["auto", adapter.id],
    ["generic", "generic"],
    ["original", undefined]
  ] as const) {
    const settings = loadDisplaySettings([
      {
        path: "settings",
        settings: { "ext.pi-tool-display": { rendererOverrides: { tool_search: mode } } }
      }
    ]);
    expect(selectAdapter(settings, "tool_search", undefined, false, info)?.id).toBe(expected);
  }
});

it("renders search headings and hides raw parameters unless requested", () => {
  const args = { query: "github issues" };
  const supplied = result(["gh_list"], "Loaded 1 tool. They are available from your next call:");
  const before = structuredClone({ args, supplied });

  for (const showParameters of [false, true]) {
    const context = renderContext(args, false);
    const renderers = createToolDisplayRenderers("tool_search", adapter, { showParameters });
    const call = renderers.renderCall(args, theme, { ...context, isPartial: true });
    expect(plain(call.render(180))).toContain("Searching tools \u2014 github issues");
    const body = renderers.renderResult(supplied, context, theme, context);
    const heading = plain(call.render(180));
    expect(heading).toContain("Searched tools \u2014 github issues");
    expect(heading.includes(JSON.stringify(args))).toBe(showParameters);
    expect(plain(body.render(180))).toContain("Loaded 1 tool: gh_list");

    const open = renderContext(args, true);
    const expanded = plain(renderers.renderResult(supplied, open, theme, open).render(180));
    expect(expanded).toContain("They are available from your next call");
    expect(expanded).not.toContain("Loaded 1 tool: gh_list");
  }

  expect({ args, supplied }).toEqual(before);
});
