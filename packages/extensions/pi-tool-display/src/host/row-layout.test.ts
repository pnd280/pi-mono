import {
  initTheme,
  ToolExecutionComponent,
  type AgentToolResult
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { genericAdapter, nativeAdapter, todoDisplayAdapter } from "../adapters/index.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import { plainTheme, renderingTui } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { bindRowChrome, layoutRow } from "./row-layout.ts";

beforeAll(() => {
  initTheme("dark", false);
});

function result(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: undefined };
}

it("keeps image-only rows without a margin", () => {
  expect(
    layoutRow(["", "image"], 0, { kind: "card", joined: false, collapse: undefined }).rows
  ).toEqual(["", "image"]);
});

describe("bound row chrome", () => {
  function summaryRows() {
    const coordinator = new TranscriptCoordinator("summary-cards", {
      cwd: "/tmp",
      mode: "summary",
      animationClock: { start: () => () => {} }
    });
    const rows = new Map<string, ToolExecutionComponent>();
    let index = 0;

    const add = (
      name: string,
      args: unknown,
      origin: "live" | "historical" = "historical",
      adapter = nativeAdapter(name) ?? genericAdapter
    ) => {
      const call = coordinator.add(
        { messageTimestamp: 1, contentIndex: index, toolCallId: String(index++) },
        name,
        args,
        adapter,
        origin
      );
      const row = new ToolExecutionComponent(
        name,
        call.reference.toolCallId,
        args,
        { showImages: true },
        createToolDisplayRenderers(name, adapter, { binding: { call, coordinator } }),
        renderingTui(),
        "/tmp"
      );
      bindRowChrome(row, call, coordinator, { active: () => true, theme: () => plainTheme });
      coordinator.attach(call, {
        invalidate: () => row.invalidate(),
        requestRender: () => {},
        setExpanded: (expanded) => row.setExpanded(expanded)
      });
      rows.set(call.key, row);

      return call;
    };

    const finish = (
      call: ReturnType<typeof add>,
      value = result("retained output"),
      outcome: "success" | "failure" = "success"
    ) => {
      coordinator.result(call, value, outcome);
      rows.get(call.key)?.updateResult({ ...value, isError: outcome === "failure" });
    };

    const text = () =>
      [...rows.values()].map((row) => row.render(80).map(stripTerminalSequences).join("\n"));

    return { coordinator, rows, add, finish, text };
  }

  it("renders nothing for a run of omitted todo calls", () => {
    const { coordinator, rows, add, finish, text } = summaryRows();

    try {
      const first = add(
        "todo",
        { action: "create", subject: "Plan" },
        "historical",
        todoDisplayAdapter
      );
      finish(first);
      finish(add("todo", { action: "update", id: 1 }, "historical", todoDisplayAdapter));
      expect([...rows.values()].map((row) => row.render(80))).toEqual([[], []]);
      // Collapsing would show nothing, so an opened run offers no collapse row.
      coordinator.activate(first, "card");
      expect(text().every((row) => !/^─+$/m.test(row))).toBe(true);
    } finally {
      coordinator.dispose();
    }
  });

  it("does not prepare hidden cards until their run opens", () => {
    const { coordinator, add, finish, text } = summaryRows();
    const invocation = vi.fn(() => [{ kind: "value" as const, text: "target" }]);
    const summary = vi.fn(() => ({ text: "prepared result" }));
    const adapter = { ...genericAdapter, invocation, summary };

    try {
      const first = add("lookup", {}, "historical", adapter);
      finish(first);
      finish(add("lookup", {}, "historical", adapter));
      expect(text()).toEqual(["\n  lookup ×2", ""]);
      expect(invocation).not.toHaveBeenCalled();
      expect(summary).not.toHaveBeenCalled();
      coordinator.activate(first, "card");
      expect(text().every((row) => row.includes("prepared result"))).toBe(true);
      expect(invocation).toHaveBeenCalled();
      expect(summary).toHaveBeenCalled();
    } finally {
      coordinator.dispose();
    }
  });
});
