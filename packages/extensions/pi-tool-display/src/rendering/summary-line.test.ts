import { initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, expect, it } from "vite-plus/test";

import { genericAdapter, nativeAdapter } from "../adapters/index.ts";
import type { DisplayCall, Outcome } from "../contracts.ts";
import { buildRunSummary } from "../summary/model.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { renderRunSummary } from "./summary-line.ts";

const cwd = "/work/project";

const plain = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  getBgAnsi: () => "",
  bold: (text: string) => text
};

// Tags make semantic colors visible without asserting full ANSI output.
const tagged = {
  ...plain,
  fg: (color: string, text: string) => `<${color}>${text}</>`,
  bold: (text: string) => `<b>${text}</b>`
};

beforeAll(() => {
  initTheme("dark", false);
});

function lines(
  build: (tools: {
    add: (name: string, args: unknown, origin?: "live" | "historical") => DisplayCall;
    finish: (call: DisplayCall, outcome?: Outcome, text?: string) => DisplayCall;
    coordinator: TranscriptCoordinator;
  }) => void,
  options: { width?: number; theme?: typeof plain } = {}
): string[] {
  const coordinator = new TranscriptCoordinator("summary-line", { cwd });
  let index = 0;

  try {
    build({
      coordinator,
      add: (name, args, origin = "historical") =>
        coordinator.add(
          { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
          name,
          args,
          nativeAdapter(name) ?? genericAdapter,
          origin
        ),
      finish: (call, outcome = "success", text = "ok") => {
        coordinator.result(
          call,
          { content: [{ type: "text", text }], details: undefined },
          outcome
        );

        return call;
      }
    });

    return renderRunSummary(buildRunSummary([...coordinator.calls.values()], cwd), {
      width: options.width ?? 200,
      theme: options.theme ?? plain
    });
  } finally {
    coordinator.dispose();
  }
}

function mixed({ add, finish, coordinator }: Parameters<Parameters<typeof lines>[0]>[0]): void {
  for (const path of ["a.ts", "b.ts", "c.ts", "d.ts", "a.ts"]) finish(add("read", { path }));
  finish(add("grep", { pattern: "run", path: "src" }));
  finish(add("find", { pattern: "*.ts" }));
  for (const path of ["src/rows.ts", "src/cards.ts", "src/rows.ts"])
    finish(add("edit", { path, edits: [] }));
  finish(add("bash", { command: "npm test" }), "failure", "Command exited with code 1");
  finish(add("bash", { command: "npm test" }));
  const created = finish(add("write", { path: "src/summary.ts", content: "" }));
  coordinator.fact(created, { kind: "change", availability: "available", change: "creation" });
}

it("lists items in call order with file counts and every command call", () => {
  expect(lines(mixed)).toEqual([
    "  Read 4 files · 2 searches · edited 2 files · ran 2 commands (1 failed) · created 1 file"
  ]);
});

it("adds no row for the problem that ended the run", () => {
  expect(
    lines(({ add, finish }) => {
      for (const code of [0, 0, 1, 0])
        finish(
          add("bash", { command: `exit ${code}` }),
          code ? "failure" : "success",
          code ? "Command exited with code 1" : "ok"
        );
      finish(add("read", { path: "." }), "failure", "EISDIR: illegal operation on a directory");
    })
  ).toEqual(["  Ran 4 commands (1 failed) · read 1 file (1 failed)"]);
});

it.each([40, 60, 120])(
  "indents every line by two spaces and wraps only between items at %i columns",
  (width) => {
    const rendered = lines(mixed, { width });
    const items = [
      "Read 4 files",
      "2 searches",
      "edited 2 files",
      "ran 2 commands",
      "created 1 file"
    ];

    for (const row of rendered) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
    expect(rendered[0]?.startsWith("  Read ")).toBe(true);
    for (const row of rendered) expect(row).toMatch(/^ {2}[^•\s]/);
    const text = rendered
      .map((row) => row.slice(2).replaceAll(/ ?\([^)]*\)/g, ""))
      .filter(Boolean)
      .join(" · ");
    expect(text.split(" · ")).toEqual(items);
  }
);

it("reserves two columns for indentation without exceeding narrow widths", () => {
  const read = ({ add, finish }: Parameters<Parameters<typeof lines>[0]>[0]) =>
    finish(add("read", { path: "a.ts" }));
  expect(lines(read, { width: 13 })).toEqual(["  Read 1 file"]);
  expect(lines(read, { width: 3 }).map(stripTerminalSequences)).toEqual(["  …"]);
  expect(lines(read, { width: 1 }).map(stripTerminalSequences)).toEqual([" "]);
  expect(lines(read, { width: 0 })).toEqual([]);
});

it("colors verbs as actions, counts as text, and the rest as muted", () => {
  expect(
    lines(
      ({ add, finish }) => {
        finish(add("edit", { path: "a.ts", edits: [] }));
        finish(add("bash", { command: "npm test" }));
        finish(add("grep", { pattern: "x" }));
        finish(add("custom_tool", {}));
      },
      // Tags count toward the width.
      { theme: tagged, width: 400 }
    )
  ).toEqual([
    "  <accent><b>Edited</b></><muted> </><text>1</><muted> file</>" +
      "<dim> · </><accent>ran</><muted> </><text>1</><muted> command</>" +
      "<dim> · </><text>1</><muted> search</>" +
      "<dim> · </><accent>custom_tool</><muted> ×</><text>1</>"
  ]);
});

it("keeps tool names in their original case", () => {
  expect(
    lines(({ add, finish }) => {
      finish(add("mcp__Exa", {}));
      finish(add("Deploy", {}));
      finish(add("read", { path: "a.ts" }));
    })
  ).toEqual(["  mcp__Exa ×1 · Deploy ×1 · read 1 file"]);
});

it("colors problem counts without adding an outcome marker", () => {
  const success = lines(({ add, finish }) => finish(add("read", { path: "a.ts" })), {
    theme: tagged
  });
  expect(success[0]).toBe("  <accent><b>Read</b></><muted> </><text>1</><muted> file</>");

  const problems = lines(
    ({ add, finish }) => {
      add("ls", { path: "." });
      finish(add("read", { path: "a.ts" }), "cancelled", "Cancelled");
    },
    { theme: tagged }
  );
  expect(problems).toEqual([
    "  <accent><b>Listed</b></><muted> </><text>1</><muted> dir</><muted> (1 unavailable)</>" +
      "<dim> · </><accent>read</><muted> </><text>1</><muted> file</><error> (1 cancelled)</>"
  ]);
});
