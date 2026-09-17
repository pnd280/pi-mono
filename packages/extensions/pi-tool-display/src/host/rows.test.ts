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

it("indexes each call once and claims source-ordered names across later appends", () => {
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
    for (const name of ["bash", "read"])
      for (const call of calls.filter((call) => call.name === name))
        expect(rows.claimCall(name)).toBe(call);
    expect(rows.claimCall("missing")).toBeUndefined();
    expect(rows.claimCall("read")).toBeUndefined();
    expect(visits).toBe(calls.length);

    for (let index = 100; index < 110; index++) {
      const call = add(index, "read");
      // Updating streamed arguments must not enqueue the same identity again.
      add(index, "read");
      expect(rows.claimCall("bash")).toBeUndefined();
      expect(rows.claimCall("read")).toBe(call);
      expect(rows.claimCall("read")).toBeUndefined();
    }

    expect(visits).toBe(110);
  } finally {
    rows.dispose();
    scan.mockRestore();
    coordinator.dispose();
  }
});
