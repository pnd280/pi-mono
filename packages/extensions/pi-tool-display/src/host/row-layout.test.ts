import {
  initTheme,
  ToolExecutionComponent,
  type AgentToolResult
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  setCapabilityOverrides,
  stripTerminalSequences
} from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { genericAdapter, nativeAdapter, todoDisplayAdapter } from "../adapters/index.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import { plainTheme, renderingTui } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { bindRowChrome, layoutRow, type RowChrome } from "./row-layout.ts";

beforeAll(() => {
  initTheme("dark", false);
});

function result(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: undefined };
}

describe("row layout", () => {
  const card = (joined: boolean, collapse?: { top: boolean; bottom: boolean }): RowChrome => ({
    kind: "card",
    joined,
    collapse: collapse && { ...collapse, rule: "---" }
  });
  // Pi's self-rendered row: margin, two renderer rows, then an image spacer and image.
  const pi = ["", "head", "body", "", "image"];

  it("keeps Pi's margin, renderer rows, and images for a plain card", () => {
    expect(layoutRow(pi, 2, card(false))).toEqual({
      rows: pi,
      targets: [undefined, { kind: "card", y: 0 }, { kind: "card", y: 1 }, undefined, undefined]
    });
  });

  it("drops the margin of a joined group member", () => {
    expect(layoutRow(pi, 2, card(true)).rows).toEqual(["head", "body", "", "image"]);
  });

  it("places collapse controls around the card and the footer after images", () => {
    const layout = layoutRow(pi, 2, card(false, { top: true, bottom: true }));
    expect(layout.rows).toEqual(["", "---", "", "head", "body", "", "image", "", "---"]);
    expect(layout.targets.map((target) => target?.kind)).toEqual([
      undefined,
      "collapse",
      "collapse",
      "card",
      "card",
      undefined,
      undefined,
      "collapse",
      "collapse"
    ]);
  });

  it("replaces the card and its images with a summary line", () => {
    expect(layoutRow(pi, 2, { kind: "summary", line: ["  Read 1 file"] })).toEqual({
      rows: ["", "  Read 1 file"],
      targets: [undefined, { kind: "card", y: 0 }]
    });
    expect(layoutRow(pi, 2, { kind: "summary", line: [] })).toEqual({ rows: [], targets: [] });
    expect(layoutRow(pi, 2, { kind: "hidden" })).toEqual({ rows: [], targets: [] });
  });

  it("keeps image-only rows without a margin", () => {
    expect(layoutRow(["", "image"], 0, card(false)).rows).toEqual(["", "image"]);
  });
});

describe("bound row chrome", () => {
  function summaryRows(mode: "summary" | "compact" = "summary") {
    const coordinator = new TranscriptCoordinator("summary-cards", {
      cwd: "/tmp",
      mode,
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

  it("renders one summary line in the leader row and nothing for other members", () => {
    const { coordinator, add, finish, text } = summaryRows();

    try {
      finish(add("read", { path: "a.ts" }));
      finish(add("read", { path: "b.ts" }));
      finish(add("bash", { command: "npm test" }), result("npm ERR! failed\nmore"), "failure");
      expect(text()).toEqual(["\n  Read 2 files · ran 1 command (1 failed)", "", ""]);
      coordinator.setMode("compact");
      expect(text()[0]).toContain("Explored");
      expect(text()[2]).toContain("Run failed npm test");
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

  it("renders a live run as its usual compact cards until the run ends", () => {
    const { coordinator, rows, add, finish, text } = summaryRows();

    try {
      const read = add("read", { path: "a.ts" }, "live");
      const shell = add("bash", { command: "npm test" }, "live");
      coordinator.update(shell, "executing");
      const partial = result(Array.from({ length: 20 }, (_, line) => `line ${line}`).join("\n"));
      coordinator.result(shell, partial, "success", true);
      rows.get(shell.key)?.updateResult({ ...partial, isError: false }, true);
      const running = text();
      coordinator.setMode("compact");
      expect(running).toEqual(text());
      coordinator.setMode("summary");

      finish(read);
      finish(shell);
      expect(text()[1]).toContain("Ran npm test");
      coordinator.settle();
      expect(text()).toEqual(["\n  Read 1 file · ran 1 command", ""]);
    } finally {
      coordinator.dispose();
    }
  });

  it("opens a run to compact cards on a leader click until the mode changes", () => {
    const { coordinator, rows, add, finish, text } = summaryRows();

    try {
      const first = add("read", { path: "a.ts" });
      finish(first);
      const last = add("bash", { command: "true" });
      finish(last);
      const click = {
        type: "click" as const,
        button: "left" as const,
        x: 2,
        y: 1,
        screenX: 2,
        screenY: 1,
        width: 80,
        height: 2,
        shift: false,
        alt: false,
        ctrl: false
      };
      expect(text()).toEqual(["\n  Read 1 file · ran 1 command", ""]);
      rows.get(first.key)?.handleMouse(click);
      expect(coordinator.run(first)?.opened).toBe(true);
      const collapse = "─".repeat(80);
      expect(text()).toEqual([
        `\n${collapse}\n\n• Read a.ts`,
        `\n• Ran true\n  └ retained output\n\n${collapse}`
      ]);
      const firstRow = rows.get(first.key)!;
      firstRow.handleMouse({ ...click, y: 2, height: firstRow.render(80).length });
      expect(first.expanded).toBe(false);
      expect(coordinator.run(first)?.opened).toBe(false);
      expect(text()).toEqual(["\n  Read 1 file · ran 1 command", ""]);
      firstRow.handleMouse(click);
      text();
      // Either control closes the same run without toggling a tool card.
      firstRow.handleMouse(click);
      expect(text()).toEqual(["\n  Read 1 file · ran 1 command", ""]);
      rows.get(first.key)?.handleMouse(click);
      const lastRow = rows.get(last.key)!;
      const height = lastRow.render(80).length;
      lastRow.handleMouse({ ...click, y: height - 2, height });
      expect(last.expanded).toBe(false);
      expect(coordinator.run(last)?.opened).toBe(false);
      expect(text()).toEqual(["\n  Read 1 file · ran 1 command", ""]);
      firstRow.handleMouse(click);
      text();
      lastRow.handleMouse({ ...click, button: "right", y: height - 1, height });
      expect(coordinator.run(last)?.opened).toBe(true);
      lastRow.handleMouse({ ...click, y: height - 1, height });
      expect(text()).toEqual(["\n  Read 1 file · ran 1 command", ""]);
      rows.get(first.key)?.handleMouse(click);
      coordinator.setMode("compact");
      expect(text()[0]).not.toContain(collapse);
      coordinator.setMode("summary");
      expect(text()[1]).toBe("");

      // A click on a live run's card keeps that run open once it ends.
      coordinator.boundary();
      const live = add("bash", { command: "npm test" }, "live");
      // Pi routes clicks only to rendered rows.
      expect(text()[2]).toContain("Running npm test");
      rows.get(live.key)?.handleMouse(click);
      expect(text()[2]).not.toContain(collapse);
      finish(live);
      coordinator.settle();
      expect(text()[2]).toBe(`\n${collapse}\n\n• Ran npm test\n  └ retained output\n\n${collapse}`);
    } finally {
      coordinator.dispose();
    }
  });

  it("counts image results without rendering image text in summary mode", () => {
    const { coordinator, add, finish, text } = summaryRows();
    const images = getCapabilities().images;

    try {
      setCapabilityOverrides({ images: null });
      finish(add("read", { path: "image.png" }), {
        content: [
          { type: "text", text: "Read image file [image/png]" },
          { type: "image", data: "private-image-bytes", mimeType: "image/png" }
        ],
        details: undefined
      });
      expect(text()).toEqual(["\n  Read 1 file"]);
      coordinator.setMode("compact");
      expect(text()[0]).toContain("image/png");
    } finally {
      setCapabilityOverrides({ images });
      coordinator.dispose();
    }
  });
});
