import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { genericAdapter } from "../adapters/generic.ts";
import { renderingTui } from "../test-fixture.ts";
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
    hideCompletedThinking: true
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
    hideCompletedThinking: true
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
