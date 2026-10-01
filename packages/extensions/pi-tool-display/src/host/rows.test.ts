import {
  AssistantMessageComponent,
  initTheme,
  ToolExecutionComponent
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  setCapabilityOverrides,
  stripTerminalSequences,
  type Component
} from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { genericAdapter } from "../adapters/generic.ts";
import { nativeAdapter } from "../adapters/native/index.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import { assistantMessage, plainTheme, renderingTui } from "../test-fixture.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { TranscriptRows } from "./rows.ts";

it("does not revisit bound transcript rows on events without new components", () => {
  initTheme("dark", false);
  let visits = 0;
  const children = new Proxy<Component[]>([], {
    get(target, key, receiver): unknown {
      if (typeof key === "string" && /^\d+$/.test(key)) visits++;

      return Reflect.get(target, key, receiver);
    }
  });
  const coordinator = new TranscriptCoordinator("row-binding");
  const host = { chatContainer: { children }, ui: renderingTui() };
  const rows = new TranscriptRows(host, coordinator, {
    active: () => true,
    styleAssistant: true,
    chrome: true
  });

  const append = (index: number) => {
    const call = coordinator.add(
      { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) },
      "custom",
      {},
      genericAdapter,
      "historical"
    );
    const definition = { renderCall: () => ({ render: () => [], invalidate() {} }) };
    rows.retainDefinition(definition, call);
    const child = new ToolExecutionComponent(
      "custom",
      String(index),
      {},
      { showImages: false },
      definition,
      host.ui,
      "/tmp"
    );
    children.push(child);

    return { call, child };
  };

  try {
    for (let index = 0; index < 1000; index++) append(index);
    rows.bind();
    visits = 0;
    for (let index = 0; index < 100; index++) rows.bind();
    expect(visits).toBeLessThan(400);
    const { call, child } = append(1000);
    rows.bind();
    child.setExpanded(true);
    expect(call.expanded).toBe(true);
    expect(visits).toBeLessThan(410);
  } finally {
    rows.dispose();
    coordinator.dispose();
  }
});

it("ignores late assistant components after binding deactivation", () => {
  initTheme("dark", false);
  const coordinator = new TranscriptCoordinator("inactive-rows");
  let active = true;
  const rows = new TranscriptRows({}, coordinator, {
    active: () => active,
    styleAssistant: true,
    chrome: true
  });
  const component = new AssistantMessageComponent(
    assistantMessage([{ type: "text", text: "Native assistant prose" }])
  );

  try {
    active = false;
    rows.dispose();
    rows.assistantBoundary(component);
    component.invalidate();
    const rendered = component.render(80).map(stripTerminalSequences).join("\n");
    expect(rendered).toContain("Native assistant prose");
    expect(rendered).not.toContain("•");
  } finally {
    rows.dispose();
    coordinator.dispose();
  }
});

it("claims matching IDs without rescanning the transcript for each call", () => {
  const coordinator = new TranscriptCoordinator("row-claims");
  const values = coordinator.calls.values.bind(coordinator.calls);
  let visits = 0;
  const scan = vi.spyOn(coordinator.calls, "values").mockImplementation(() => {
    const iterator = values();
    const next = iterator.next.bind(iterator);

    iterator.next = () => {
      visits++;

      return next();
    };

    return iterator;
  });
  const rows = new TranscriptRows({}, coordinator, {
    active: () => true,
    styleAssistant: true,
    chrome: true
  });
  const add = (index: number, name: string) =>
    coordinator.add(
      { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) },
      name,
      {},
      genericAdapter,
      "historical"
    );

  try {
    const calls = Array.from({ length: 100 }, (_, index) =>
      add(index, index % 2 === 0 ? "read" : "bash")
    );
    expect(rows.claimCall("read", "missing")).toBeUndefined();
    expect(rows.claimCall("bash", "0")).toBeUndefined();
    for (const call of [...calls].reverse())
      expect(rows.claimCall(call.name, call.reference.toolCallId)).toBe(call);
    expect(rows.claimCall("read", "0")).toBeUndefined();
    expect(visits).toBeLessThan(calls.length * 3);

    for (let index = 100; index < 110; index++) {
      const call = add(index, "read");
      // Updating streamed arguments must not enqueue the same identity again.
      add(index, "read");
      expect(rows.claimCall("bash", String(index))).toBeUndefined();
      expect(rows.claimCall("read", String(index))).toBe(call);
      expect(rows.claimCall("read", String(index))).toBeUndefined();
    }

    expect(visits).toBeLessThan(330);
    // Historical branches can reuse an ID in distinct assistant messages.
    const repeated = [111, 112].map((messageTimestamp) =>
      coordinator.add(
        { messageTimestamp, contentIndex: 0, toolCallId: "repeated" },
        "read",
        {},
        genericAdapter,
        "historical"
      )
    );
    for (const call of repeated) expect(rows.claimCall("read", "repeated")).toBe(call);
    expect(rows.claimCall("read", "repeated")).toBeUndefined();
    expect(visits).toBeLessThan(350);
  } finally {
    rows.dispose();
    scan.mockRestore();
    coordinator.dispose();
  }
});

it("hides collapsed summary members and drops images until a click opens the run", () => {
  initTheme("dark", false);
  const images = getCapabilities().images;
  setCapabilityOverrides({ images: "kitty" });
  const coordinator = new TranscriptCoordinator("summary-rows", {
    cwd: "/tmp",
    mode: "summary",
    animationClock: { start: () => () => {} }
  });
  const children: Component[] = [];
  const host = { chatContainer: { children }, ui: renderingTui() };
  const rows = new TranscriptRows(host, coordinator, {
    active: () => true,
    styleAssistant: true,
    chrome: true
  });
  rows.useTheme(plainTheme);

  const append = (index: number, name: string, args: unknown, origin: "live" | "historical") => {
    const adapter = nativeAdapter(name)!;
    const call = coordinator.add(
      { messageTimestamp: index, contentIndex: 0, toolCallId: String(index) },
      name,
      args,
      adapter,
      origin
    );
    const definition = createToolDisplayRenderers(name, adapter, {
      binding: { call, coordinator }
    });
    rows.retainDefinition(definition, call);
    const child = new ToolExecutionComponent(
      name,
      String(index),
      args,
      { showImages: true },
      definition,
      host.ui,
      "/tmp"
    );
    children.push(child);

    return { call, child };
  };

  try {
    const image = {
      content: [
        { type: "text" as const, text: "Read image file [image/png]" },
        { type: "image" as const, data: "iVBORw0KGgo=", mimeType: "image/png" }
      ],
      details: undefined
    };
    const leader = append(0, "read", { path: "image.png" }, "historical");
    coordinator.result(leader.call, image, "success");
    leader.child.updateResult({ ...image, isError: false });
    const hidden = append(1, "read", { path: "b.ts" }, "historical");
    const shell = append(2, "bash", { command: "sleep 1" }, "historical");
    rows.bind();

    const render = (child: ToolExecutionComponent) =>
      child.render(80).map((row) => stripTerminalSequences(row));

    expect(render(leader.child)).toEqual([
      "",
      "  Read 2 files (1 unavailable) · ran 1 command (1 unavailable)"
    ]);
    expect(render(hidden.child)).toEqual([]);
    expect(render(shell.child)).toEqual([]);
    expect(
      hidden.child.handleMouse({
        type: "click",
        button: "left",
        x: 0,
        y: 0,
        screenX: 0,
        screenY: 0,
        width: 80,
        height: 0,
        shift: false,
        alt: false,
        ctrl: false
      })
    ).toBeUndefined();

    leader.child.handleMouse({
      type: "click",
      button: "left",
      x: 2,
      y: 1,
      screenX: 2,
      screenY: 1,
      width: 80,
      height: 2,
      shift: false,
      alt: false,
      ctrl: false
    });
    expect(coordinator.run(leader.call)?.opened).toBe(true);
    // Opened runs restore compact cards, image rows, and group joins beneath the
    // leader's collapse row.
    expect(render(leader.child).slice(0, 5)).toEqual([
      "",
      "─".repeat(80),
      "",
      "• Explored . · 1 outcome unavailable",
      "  ├ Read image.png"
    ]);
    expect(render(leader.child).length).toBeGreaterThan(5);
    expect(render(hidden.child)).toEqual(["  └ Read outcome unavailable b.ts"]);
    expect(render(shell.child)).toEqual([
      "",
      "• Run outcome unavailable sleep 1",
      "",
      "─".repeat(80)
    ]);
    // Even a historical tail with no result slot has a working bottom control.
    shell.child.handleMouse({
      type: "click",
      button: "left",
      x: 2,
      y: 3,
      screenX: 2,
      screenY: 3,
      width: 80,
      height: 4,
      shift: false,
      alt: false,
      ctrl: false
    });
    expect(coordinator.run(shell.call)?.opened).toBe(false);
    expect(render(shell.child)).toEqual([]);
    coordinator.activate(leader.call, "card");

    rows.dispose();
    // Restored rows render Pi's own layout, including its margin.
    expect(render(hidden.child)).toEqual(["", "  └ Read outcome unavailable b.ts"]);
  } finally {
    setCapabilityOverrides({ images });
    rows.dispose();
    coordinator.dispose();
  }
});
