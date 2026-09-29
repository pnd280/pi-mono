import { expect, it } from "vite-plus/test";

import {
  genericAdapter,
  nativeAdapter,
  selectiveReadDisplayAdapter,
  todoDisplayAdapter
} from "../adapters/index.ts";
import type { DisplayCall, Outcome, SummaryNotice, ToolDisplayAdapter } from "../contracts.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { buildRunSummary, type RunSummary } from "./model.ts";

const cwd = "/work/project";

function transcript() {
  const coordinator = new TranscriptCoordinator("summary-model", { cwd });
  let index = 0;

  const add = (
    name: string,
    args: unknown,
    options: { adapter?: ToolDisplayAdapter; origin?: "live" | "historical" } = {}
  ) =>
    coordinator.add(
      { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
      name,
      args,
      options.adapter ?? nativeAdapter(name) ?? genericAdapter,
      options.origin ?? "historical"
    );

  const finish = (call: DisplayCall, outcome: Outcome = "success", text = "ok") => {
    coordinator.result(call, { content: [{ type: "text", text }], details: undefined }, outcome);

    return call;
  };

  return {
    coordinator,
    add,
    finish,
    summary: (notices?: (call: DisplayCall) => readonly SummaryNotice[]) =>
      buildRunSummary(
        [...coordinator.calls.values()],
        (call) => coordinator.interpretation(call),
        notices
      )
  };
}

/** Category, count, and nonzero markers. */
function shape(summary: RunSummary): string[] {
  return summary.segments.map((segment) => {
    const markers = Object.entries(segment.counts)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ` ${name}=${count}`)
      .join("");

    return `${segment.category.id}:${segment.count}${markers}`;
  });
}

it("orders categories by first call and counts files once per category", () => {
  const { coordinator, add, finish, summary } = transcript();

  try {
    finish(add("read", { path: "src/rows.ts" }));
    finish(add("read", { path: "./src/rows.ts", offset: 20 }));
    finish(add("read", { path: `${cwd}/src/cards.ts` }));
    finish(add("grep", { pattern: "run", path: "src" }));
    finish(add("grep", { pattern: "run", path: "src" }));
    // A read file that is later edited counts in both categories.
    finish(add("edit", { path: "src/rows.ts", edits: [] }));
    finish(add("edit", { path: "src/rows.ts", edits: [] }));
    finish(add("ls", { path: "src" }));
    finish(add("ls", { path: "./src/" }));

    expect(shape(summary())).toEqual(["read:2", "search:2", "edit:1", "list:1"]);
  } finally {
    coordinator.dispose();
  }
});

it("counts notices in source order separately from calls, deduplicating by category and identity", () => {
  const { coordinator, add, finish, summary } = transcript();
  const loaded: SummaryNotice = {
    category: { id: "loaded", count: { one: "loaded {n} file", other: "loaded {n} files" } },
    identity: "/work/project/src/AGENTS.md"
  };
  const updated: SummaryNotice = {
    category: { id: "updated", count: { one: "updated {n} file", other: "updated {n} files" } },
    identity: loaded.identity
  };

  try {
    const read = finish(add("read", { path: "src/AGENTS.md" }), "failure");
    const shell = finish(add("bash", { command: "true" }));
    const todo = finish(add("todo", {}, { adapter: todoDisplayAdapter }));
    const notices = new Map([
      [read, [loaded]],
      [shell, [loaded, { ...loaded, identity: "/work/project/lib/AGENTS.md" }]],
      [todo, [updated]]
    ]);
    expect(shape(summary((call) => notices.get(call) ?? []))).toEqual([
      "read:1 failed=1",
      "loaded:2",
      "shell:1",
      "updated:1"
    ]);
  } finally {
    coordinator.dispose();
  }
});

it("counts a selective read of one file once and separates created from modified writes", () => {
  const { coordinator, add, finish, summary } = transcript();

  try {
    const selection = { startLine: 1 };
    finish(add("read", { path: "a.ts", selection }, { adapter: selectiveReadDisplayAdapter }));
    finish(add("read", { path: "a.ts" }, { adapter: selectiveReadDisplayAdapter }));
    const created = finish(add("write", { path: "new.ts", content: "" }));
    coordinator.fact(created, { kind: "change", availability: "available", change: "creation" });
    const modified = finish(add("write", { path: "old.ts", content: "" }));
    coordinator.fact(modified, {
      kind: "change",
      availability: "available",
      change: "modification"
    });
    // Older history has no change fact and counts as an edit.
    finish(add("write", { path: "unknown.ts", content: "" }));

    expect(shape(summary())).toEqual(["read:1", "create:1", "edit:2"]);
  } finally {
    coordinator.dispose();
  }
});

it("counts every command call but only the latest outcome per file", () => {
  const { coordinator, add, finish, summary } = transcript();

  try {
    finish(add("bash", { command: "exit 0" }));
    finish(add("bash", { command: "exit 0" }));
    finish(add("bash", { command: "exit 1" }), "failure", "Command exited with code 1");
    finish(add("bash", { command: "exit 0" }));
    finish(add("edit", { path: "a.ts", edits: [] }), "failure", "No match");
    finish(add("edit", { path: "a.ts", edits: [] }));
    finish(add("edit", { path: "b.ts", edits: [] }), "failure", "No match");

    expect(shape(summary())).toEqual(["shell:4 failed=1", "edit:2 failed=1"]);
  } finally {
    coordinator.dispose();
  }
});

it.each([
  ["read", nativeAdapter("read")!, "read"],
  ["read", selectiveReadDisplayAdapter, "read"],
  ["edit", nativeAdapter("edit")!, "edit"],
  ["write", nativeAdapter("write")!, "edit"],
  ["ls", nativeAdapter("ls")!, "list"]
] as const)(
  "deduplicates %s paths by native Unicode-space identity (%#)",
  (name, adapter, category) => {
    const { coordinator, add, finish, summary } = transcript();
    const args = Object.freeze({ path: "src\u00a0dir/a\u2007b.ts" });

    try {
      finish(add(name, args, { adapter }), "failure", "first attempt failed");
      finish(add(name, { path: "src dir/a b.ts" }, { adapter }));
      expect(shape(summary())).toEqual([`${category}:1`]);
      finish(add(name, { path: "src\u202fdir/a b.ts" }, { adapter }), "cancelled");
      expect(shape(summary())).toEqual([`${category}:1 cancelled=1`]);
      expect(args.path).toBe("src\u00a0dir/a\u2007b.ts");
    } finally {
      coordinator.dispose();
    }
  }
);

it("distinguishes cancelled and unavailable items", () => {
  const { coordinator, add, finish, summary } = transcript();

  try {
    finish(add("bash", { command: "sleep 10" }), "cancelled", "Cancelled");
    add("read", { path: "history.ts" });

    expect(shape(summary())).toEqual(["shell:1 cancelled=1", "read:1 unavailable=1"]);
  } finally {
    coordinator.dispose();
  }
});

it("uses fallback and adapter-declared categories", () => {
  const { coordinator, add, finish, summary } = transcript();
  const custom: ToolDisplayAdapter = {
    id: "custom",
    family: "invocation",
    summaryCategories: [
      { id: "deploy", count: { one: "deployed {n} app", other: "deployed {n} apps" } },
      // Built-in categories cannot be redefined.
      { id: "read", count: { one: "x", other: "x" } }
    ],
    summaryItems: (args) => [{ category: args === "unknown" ? "mystery" : "deploy" }]
  };

  try {
    finish(add("read", { path: "a.ts" }));
    finish(add("deploy", {}, { adapter: custom }));
    finish(add("deploy", "unknown", { adapter: custom }));
    finish(add("custom_tool", {}));
    finish(add("custom_tool", {}));

    const { segments } = summary();
    expect(shape(summary())).toEqual([
      "read:1",
      "deploy:1",
      "other:mystery:1",
      "other:custom_tool:2"
    ]);
    expect(segments[0]?.category.count.one).toBe("read {n} file");
  } finally {
    coordinator.dispose();
  }
});

it("falls back when adapters reject partial arguments or throw", () => {
  const { coordinator, add, finish, summary } = transcript();
  const throwing: ToolDisplayAdapter = {
    id: "throwing",
    family: "read",
    summaryItems: () => {
      throw new Error("partial");
    }
  };

  try {
    finish(add("edit", {}));
    finish(add("bash", { command: 1 }));
    finish(add("read", { path: "a.ts" }, { adapter: throwing }));

    // A throwing adapter is replaced by the generic adapter, not trusted for its family.
    expect(shape(summary())).toEqual(["edit:1", "shell:1", "other:read:1"]);
  } finally {
    coordinator.dispose();
  }
});

it("omits owner-excluded calls, including invalid todo calls, and supported empty items", () => {
  const { coordinator, add, finish, summary } = transcript();
  const todo = (args: unknown) => add("todo", args, { adapter: todoDisplayAdapter });

  try {
    finish(todo({ action: "create", subject: "Plan" }));
    finish(todo({}), "failure", "Invalid todo arguments");
    finish(
      add(
        "bookkeeping",
        {},
        { adapter: { id: "owner:empty", family: "invocation", summaryItems: () => [] } }
      )
    );
    expect(summary()).toEqual({ segments: [] });

    finish(add("read", { path: "a.ts" }));
    finish(todo({ action: "update", id: 1 }), "failure", "No todo 1");
    expect(shape(summary())).toEqual(["read:1"]);
  } finally {
    coordinator.dispose();
  }
});

it.each([{ items: [] }, { items: [{ category: "read", identity: "untrusted-file" }] }])(
  "keeps generic summary fallback without interpreting unsupported items $items",
  ({ items }) => {
    const { coordinator, add, finish, summary } = transcript();
    const adapter: ToolDisplayAdapter = {
      id: "owner:unsupported",
      family: "read",
      supports: () => false,
      summaryItems: () => items,
      outcome: () => "success"
    };

    try {
      finish(add("custom", {}, { adapter }), "failure", "Unsupported result");
      expect(shape(summary())).toEqual(["other:custom:1 failed=1"]);
    } finally {
      coordinator.dispose();
    }
  }
);
