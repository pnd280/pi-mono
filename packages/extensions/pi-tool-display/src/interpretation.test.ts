import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { genericAdapter } from "./adapters/generic.ts";
import type { DisplayCall, Outcome, ToolDisplayAdapter } from "./contracts.ts";
import { interpret } from "./interpretation.ts";
import { buildRunSummary } from "./summary/model.ts";
import { TranscriptCoordinator } from "./transcript/coordinator.ts";
import { record } from "./values.ts";

const cwd = "/work/project";
const result = (text = "ok"): AgentToolResult<unknown> => ({
  content: [{ type: "text", text }],
  details: undefined
});
const reader: ToolDisplayAdapter = {
  id: "reader",
  family: "read",
  exploration: (args) => [{ parts: [], scope: { kind: "file", value: String(record(args).path) } }]
};

function transcript(onAdapterFailure?: (adapter: ToolDisplayAdapter) => void) {
  const coordinator = new TranscriptCoordinator("interpretation", {
    cwd,
    ...(onAdapterFailure ? { onAdapterFailure } : {})
  });
  let index = 0;
  const add = (adapter: ToolDisplayAdapter, args: unknown = {}, name = "tool") =>
    coordinator.add(
      { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
      name,
      args,
      adapter,
      "live"
    );

  return { coordinator, add };
}

it("falls back to generic only for transcript results the selected adapter declines", () => {
  const declining: ToolDisplayAdapter = { ...reader, supports: () => false };
  const { coordinator, add } = transcript();

  try {
    const call = add(declining, { path: "a.ts" });
    // Arguments alone are not checked: the call keeps its adapter until a result arrives.
    expect(coordinator.interpretation(call).adapter).toBe(declining);
    coordinator.result(call, result(), "success");
    expect(coordinator.interpretation(call).adapter).toBe(genericAdapter);
    expect(coordinator.interpretation(call).group).toBeUndefined();
  } finally {
    coordinator.dispose();
  }

  // Standalone owners assert compatibility with their explicit adapter.
  const standalone = interpret(
    { name: "tool", adapter: declining, args: {}, result: result(), pending: false, failed: false },
    cwd
  );
  expect(standalone.adapter).toBe(declining);
});

it("ranks cancellation over failure and failure over unavailable metadata", () => {
  const { coordinator, add } = transcript();
  const reporting = (outcome: Outcome): ToolDisplayAdapter => ({
    id: `reporting-${outcome}`,
    family: "invocation",
    outcome: () => outcome
  });

  try {
    const pending = add(reporting("failure"));
    expect(coordinator.interpretation(pending).pending).toBe(true);
    coordinator.result(pending, result(), "success", true);
    // Partial results never publish adapter outcomes.
    expect(coordinator.interpretation(pending).outcome).toBe("unavailable");
    coordinator.result(pending, result(), "success");
    expect(coordinator.interpretation(pending).pending).toBe(false);
    expect(coordinator.interpretation(pending).outcome).toBe("failure");

    const unavailable = add(reporting("unavailable"));
    coordinator.result(unavailable, result(), "success");
    expect(coordinator.interpretation(unavailable).outcome).toBe("unavailable");

    const cancelled = add(reporting("failure"));
    coordinator.result(cancelled, result(), "failure");
    coordinator.fact(cancelled, { kind: "cancellation", availability: "available" });
    expect(coordinator.interpretation(cancelled).outcome).toBe("cancelled");
  } finally {
    coordinator.dispose();
  }

  const standalone = (failed: boolean, pending = false) =>
    interpret(
      { name: "tool", adapter: reporting("success"), args: {}, result: result(), pending, failed },
      cwd
    ).outcome;
  expect(standalone(false)).toBe("success");
  expect(standalone(true)).toBe("failure");
});

it("refreshes interpretation when a producer republishes a mutated result object", () => {
  const { coordinator, add } = transcript();
  const adapter: ToolDisplayAdapter = {
    ...reader,
    outcome: (value) => (record(value.details).failed === true ? "failure" : "success")
  };
  const value = { ...result(), details: { failed: false } };

  try {
    const call = add(adapter, { path: "a.ts" });
    coordinator.result(call, value, "success");
    expect(coordinator.interpretation(call).outcome).toBe("success");
    value.details.failed = true;
    coordinator.result(call, value, "success");
    expect(coordinator.interpretation(call).outcome).toBe("failure");
  } finally {
    coordinator.dispose();
  }
});

it("normalizes grouping identities against the transcript cwd", () => {
  const { coordinator, add } = transcript();

  try {
    const relative = add(reader, { path: "src/a.ts" });
    const absolute = add(reader, { path: `${cwd}/src/b.ts` });
    const outside = add(reader, { path: "../other/c.ts" });

    expect(coordinator.interpretation(relative).group).toEqual({
      scope: { kind: "directory", value: `${cwd}/src` },
      title: undefined
    });
    expect(coordinator.interpretation(absolute).group).toEqual(
      coordinator.interpretation(relative).group
    );
    expect(coordinator.interpretation(outside).group?.scope.value).toBe("/work/other");
    expect(coordinator.group(relative)?.members).toEqual([relative, absolute]);
  } finally {
    coordinator.dispose();
  }
});

it.each(["mcp", "outcome", "summaryItems"] as const)(
  "keeps groups and summary identities generic when %s throws",
  (callback) => {
    const { coordinator, add } = transcript();
    const adapter: ToolDisplayAdapter = {
      ...reader,
      summaryItems: () => [{ category: "read", identity: "same-file" }],
      [callback]: () => {
        throw new Error(callback);
      }
    };

    try {
      const first = add(adapter, { path: "a.ts" }, "read");
      const second = add(adapter, { path: "b.ts" }, "read");
      coordinator.result(first, result(), "success");
      coordinator.result(second, result(), "success");
      expect(coordinator.group(first)).toBeUndefined();
      const summary = buildRunSummary([first, second], (call) => coordinator.interpretation(call));
      expect(summary.segments.map(({ category, count }) => [category.id, count])).toEqual([
        ["other:read", 2]
      ]);
    } finally {
      coordinator.dispose();
    }
  }
);

it("replaces an adapter that throws with generic and reports each failed interpretation", () => {
  const failures = vi.fn<(adapter: ToolDisplayAdapter) => void>();
  const { coordinator, add } = transcript(failures);
  const throwing = (callback: keyof ToolDisplayAdapter): ToolDisplayAdapter => ({
    ...reader,
    id: `throwing-${callback}`,
    [callback]: () => {
      throw new Error(callback);
    }
  });

  try {
    for (const callback of ["supports", "exploration", "mcp", "outcome", "summaryItems"] as const) {
      const call: DisplayCall = add(throwing(callback), { path: "a.ts" }, "read");
      coordinator.result(call, result(), "success");
      const interpretation = coordinator.interpretation(call);

      expect(interpretation.outcome).toBe("success");
      expect(interpretation.summaryItems).toEqual([{ category: "other:read" }]);
      expect(interpretation.group).toBeUndefined();
      expect(interpretation.adapter).toBe(genericAdapter);
      // A fresh interpretation reports once, however many fields read the failed adapter.
      failures.mockClear();
      const fresh = interpret({ call }, cwd, failures);
      expect(fresh.adapter).toBe(genericAdapter);
      expect(failures).toHaveBeenCalledTimes(1);
      expect(failures.mock.calls[0]?.[0].id).toBe(`throwing-${callback}`);
    }
  } finally {
    coordinator.dispose();
  }
});
