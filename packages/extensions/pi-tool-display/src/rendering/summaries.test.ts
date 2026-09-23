import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, expect, it } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import {
  nativeAdapter,
  piFffAdapter,
  piMcpAdapter,
  todoDisplayAdapter
} from "../adapters/index.ts";
import { mcpToolInfo } from "../adapters/pi-mcp-adapter/test-fixture.ts";
import type { OperationFact, ToolDisplayAdapter } from "../contracts.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { createToolDisplayRenderers } from "./cards.ts";
import type { DisplayContext } from "./types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};

beforeAll(() => initTheme("dark", false));

function render({
  name,
  adapter,
  args,
  result,
  grouped = false,
  expanded = false,
  failed = false,
  partial = false,
  operation,
  width = 100
}: {
  name: string;
  adapter?: ToolDisplayAdapter | undefined;
  args: unknown;
  result: AgentToolResult<unknown>;
  grouped?: boolean;
  expanded?: boolean;
  failed?: boolean;
  partial?: boolean;
  operation?: OperationFact;
  width?: number;
}) {
  const coordinator = new TranscriptCoordinator("summary-test");
  const selected = adapter ?? { id: "generic", family: "invocation" as const };
  const call = coordinator.add(
    { messageTimestamp: 1, contentIndex: 0, toolCallId: "first" },
    name,
    args,
    selected,
    partial ? "live" : "historical"
  );
  if (grouped)
    coordinator.add(
      { messageTimestamp: 1, contentIndex: 1, toolCallId: "second" },
      name,
      args,
      selected,
      "historical"
    );
  if (operation) coordinator.fact(call, operation);
  coordinator.result(call, result, failed ? "failure" : "success", partial);
  coordinator.expand(call, expanded);
  const context: DisplayContext = {
    args,
    state: {},
    toolCallId: "first",
    cwd: "/tmp",
    lastComponent: undefined,
    executionStarted: true,
    argsComplete: true,
    isPartial: partial,
    expanded,
    showImages: false,
    isError: failed,
    invalidate() {}
  };

  try {
    const renderer = createToolDisplayRenderers(name, selected, { binding: { call, coordinator } });
    const rows = [
      ...renderer.renderCall(args, theme, context).render(width),
      ...renderer.renderResult(result, context, theme, context).render(width)
    ];
    expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);

    return stripTerminalSequences(rows.join("\n"));
  } finally {
    coordinator.dispose();
  }
}

it.each(
  ["ffgrep", "fffind", "fff-multi-grep"].flatMap((name) =>
    [false, true].map((grouped) => ({ name, grouped }))
  )
)("prefers $name summaries and retains diagnostics (grouped=$grouped)", ({ name, grouped }) => {
  const multi = name === "fff-multi-grep";
  const adapter = piFffAdapter(fffToolInfo(name, multi))!;
  const result = {
    content: [{ type: "text" as const, text: 'retained match\n\n[Continue with cursor="next"]' }],
    details: { totalMatched: 9, totalFiles: 328 }
  };
  const args = multi ? { patterns: ["token"] } : { pattern: "token" };
  const options = { name, adapter, args, result, grouped };
  const matches = name === "fffind" ? "9 matching files" : "9 matches collected";
  const compact = render(options);
  expect(compact).toContain(matches);
  expect(compact).not.toContain("indexed files");
  expect(compact).toContain('Continue with cursor="next"');
  expect(compact).not.toContain("retained match");
  const expanded = render({ ...options, expanded: true });
  expect(expanded).toContain("retained match");
  expect(expanded).toContain(`${matches} · 328 indexed files`);
  expect(result.content[0]!.text).toContain("retained match");
});

it.each([false, true])(
  "falls back to retained output when FFF counts are absent (grouped=%s)",
  (grouped) => {
    const text = Array.from({ length: 20 }, (_, i) => `match ${i}`).join("\n");
    const compact = render({
      name: "ffgrep",
      adapter: piFffAdapter(fffToolInfo("ffgrep")),
      args: { pattern: "token" },
      result: { content: [{ type: "text", text }], details: {} },
      grouped
    });
    expect(compact).toContain("match 0");
    expect(compact).toContain("match 19");
    expect(compact).toContain("more rows");
    expect(compact).not.toContain("indexed files");
  }
);

it.each(["failure", "partial"])(
  "does not replace %s FFF output with a completed summary",
  (state) => {
    const text = render({
      name: "ffgrep",
      adapter: piFffAdapter(fffToolInfo("ffgrep")),
      args: { pattern: "token" },
      result: {
        content: [{ type: "text", text: "important diagnostic" }],
        details: { totalMatched: 9, totalFiles: 328 }
      },
      grouped: true,
      failed: state === "failure",
      partial: state === "partial"
    });
    expect(text).toContain("important diagnostic");
    expect(text).not.toContain("9 matches collected");
  }
);

it.each([false, true])(
  "keeps confirmed Tasks state and progress in compact cards (grouped=%s)",
  (grouped) => {
    const options = {
      name: "todo",
      adapter: todoDisplayAdapter,
      args: { action: "update", id: 4, status: "completed" },
      result: {
        content: [{ type: "text" as const, text: "full task result" }],
        details: {
          tasks: [
            { id: 4, subject: "Review", status: "completed" },
            { id: 5, subject: "Ship", status: "pending" }
          ]
        }
      },
      grouped
    };
    const compact = render(options);
    expect(compact).toContain("#4 completed · 1/2 completed · 1 pending");
    expect(compact).not.toContain("full task result");
    expect(render({ ...options, expanded: true })).toContain("full task result");
  }
);

it.each([false, true])("preserves literal todo source in result bodies (failed=%s)", (failed) => {
  const source =
    "#1 [in_progress] Explain owner: and [pending]\n  description: Keep blockedBy: and [in_progress] literal.\n  owner: description: example";
  const result = { content: [{ type: "text" as const, text: source }], details: undefined };
  const output = render({
    name: "todo",
    adapter: todoDisplayAdapter,
    args: { action: "get", id: 1 },
    result,
    expanded: true,
    failed,
    width: 120
  });
  for (const line of source.split("\n")) expect(output).toContain(line);
  expect(result.content[0]!.text).toBe(source);
});

it("preserves shell output beside recorded status and duration", () => {
  const options = {
    name: "bash",
    adapter: nativeAdapter("bash"),
    args: { command: "pwd" },
    result: { content: [{ type: "text" as const, text: "/workspace" }], details: undefined }
  };
  const text = render({
    ...options,
    operation: {
      kind: "operation",
      availability: "available",
      outcome: "success",
      durationMs: 12,
      exitCode: 0
    }
  });
  expect(text).toContain("Exit 0 · 12ms");
  expect(text).toContain("/workspace");
  expect(text.indexOf("Exit 0")).toBeLessThan(text.indexOf("/workspace"));
  expect(render(options)).not.toContain("Exit 0");
});

it.each([
  [{ outcome: "failure", exitCode: 7 }, "Exit 7"],
  [{ outcome: "failure", timedOut: true }, "Timed out"],
  [{ outcome: "cancelled", exitCode: null }, "Cancelled"],
  [{ outcome: "success" }, "exit unknown"]
] as const)("reports recorded shell status without hiding diagnostics (%j)", (status, label) => {
  const text = render({
    name: "bash",
    adapter: nativeAdapter("bash"),
    args: { command: "command" },
    result: { content: [{ type: "text", text: "published diagnostic" }], details: undefined },
    operation: { kind: "operation", availability: "available", durationMs: 12, ...status },
    failed: status.outcome !== "success"
  });
  expect(text).toContain(label);
  expect(text).toContain("12ms");
  expect(text).toContain("published diagnostic");
  expect(text).not.toContain("Exit 0");
});

it("summarizes MCP script operations without concealing failed-call output", () => {
  const adapter = piMcpAdapter(mcpToolInfo("mcpScript"))!;
  const base = {
    name: "mcpScript",
    adapter,
    args: { code: "emit(await tools.call('docs.search', {}))" },
    result: {
      content: [{ type: "text" as const, text: "emitted result details" }],
      details: { mode: "script", calls: [{ operation: "call", ok: true }] }
    }
  };
  const success = render(base);
  expect(success).toContain("1 MCP operation succeeded");
  expect(success).not.toContain("emitted result details");
  expect(render({ ...base, expanded: true })).toContain("emitted result details");
  const failed = render({
    ...base,
    result: {
      ...base.result,
      details: {
        mode: "script",
        calls: [
          { operation: "call", ok: true },
          { operation: "search", ok: false, error: "offline" }
        ]
      }
    }
  });
  expect(failed).toContain("2 MCP operations");
  expect(failed).toContain("1 MCP script operation failed");
  expect(failed).toContain("emitted result details");
});

it("keeps MCP unfinished operations, truncation, and saved-output references visible", () => {
  const text = render({
    name: "mcpScript",
    adapter: piMcpAdapter(mcpToolInfo("mcpScript")),
    args: { code: "await tools.call('docs.search', {})" },
    result: {
      content: [{ type: "text", text: "timeout diagnostic" }],
      details: {
        mode: "script",
        error: "timeout",
        calls: [{ operation: "call", ok: false, error: "incomplete" }],
        outputGuard: { truncated: true, fullOutputPath: "/tmp/output.txt" }
      }
    }
  });
  expect(text).toContain("1 MCP operation");
  expect(text).toContain("1 MCP script operation unfinished");
  expect(text).not.toContain("operation failed");
  expect(text).not.toContain("succeeded");
  expect(text).toContain("timeout diagnostic");
  expect(text).toContain("MCP output truncated");
  expect(text).toContain("Saved output: /tmp/output.txt");
});

it.each([false, true])(
  "keeps summaries, informational notices, and images at narrow widths (grouped=%s)",
  (grouped) => {
    const text = render({
      name: "ffgrep",
      adapter: {
        ...piFffAdapter(fffToolInfo("ffgrep"))!,
        notices: () => [{ kind: "info", text: "Extra information" }]
      },
      args: { pattern: "token" },
      result: {
        content: [
          { type: "text", text: "hidden output" },
          { type: "image", mimeType: "image/png", data: "" }
        ],
        details: { totalMatched: 9, totalFiles: 328 }
      },
      grouped,
      width: 32
    });
    expect(text).toContain("9 matches collected");
    expect(text).not.toContain("indexed files");
    expect(text).toContain("Extra information");
    expect(text).toContain("[Image: image/png]");
    expect(text).not.toContain("hidden output");
  }
);

it.each([false, true])(
  "keeps native search output as a bounded fallback (grouped=%s)",
  (grouped) => {
    const text = render({
      name: "grep",
      adapter: nativeAdapter("grep"),
      args: { pattern: "match" },
      result: {
        content: [
          { type: "text", text: Array.from({ length: 20 }, (_, i) => `match ${i}`).join("\n") }
        ],
        details: undefined
      },
      grouped
    });
    expect(text).toContain("match 0");
    expect(text).toContain("match 19");
    expect(text).toContain("more rows");
  }
);

it("treats empty summaries as absent and never suppresses failure output", () => {
  for (const [summary, failed] of [
    [" ", false],
    ["Result summary", true]
  ] as const) {
    const text = render({
      name: "custom",
      adapter: { id: "custom", family: "invocation", summary: () => ({ text: summary }) },
      args: {},
      result: { content: [{ type: "text", text: "retained output" }], details: undefined },
      failed
    });
    expect(text).toContain("retained output");
  }
});

it("keeps unknown tool output as a bounded fallback", () => {
  const text = render({
    name: "custom",
    args: {},
    result: {
      content: [
        { type: "text", text: Array.from({ length: 30 }, (_, i) => `answer ${i}`).join("\n") }
      ],
      details: { summary: "untrusted metadata" }
    }
  });
  expect(text).toContain("answer 0");
  expect(text).toContain("answer 29");
  expect(text).toContain("more rows");
  expect(text).not.toContain("untrusted metadata");
});
