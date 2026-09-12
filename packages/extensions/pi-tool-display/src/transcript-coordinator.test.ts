import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { nativeAdapter, genericAdapter } from "./adapters.ts";
import { isLive } from "./display-model.ts";
import { TranscriptCoordinator } from "./transcript-coordinator.ts";

const result = (text = "retained") => ({
  content: [{ type: "text" as const, text }],
  details: undefined
});
function fixture() {
  const stop = vi.fn();
  let tick = () => {};
  const start = vi.fn((callback: () => void) => {
    tick = callback;
    return stop;
  });
  const coordinator = new TranscriptCoordinator("runtime", { start });
  let position = 0;
  const add = (name: string, path: string, origin: "live" | "historical" = "live") =>
    coordinator.add(
      { messageTimestamp: 1, contentIndex: position++, toolCallId: `call-${position}` },
      name,
      { path },
      nativeAdapter(name) ?? genericAdapter,
      origin
    );
  return { coordinator, add, start, stop, tick: () => tick() };
}
it("regroups late historical contracts without changing results, source order, or live activity", () => {
  const { coordinator: c, start } = fixture();
  try {
    const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "first" };
    const first = c.add(reference, "fffind", { pattern: "a" }, genericAdapter, "historical");
    const second = c.add(
      { ...reference, contentIndex: 1, toolCallId: "second" },
      "fffind",
      { pattern: "b" },
      genericAdapter,
      "historical"
    );
    const retained = result("retained results");
    c.result(first, retained, "success");
    c.result(second, retained, "failure");
    const row = { invalidate: vi.fn(), setExpanded: vi.fn() };
    c.attach(first, row);
    c.expand(first, true);
    const adapter = {
      id: "fff:find",
      family: "search" as const,
      exploration: () => [
        { label: "Search" as const, parts: [{ kind: "value" as const, text: "supplied pattern" }] }
      ]
    };
    c.setAdapter(first, adapter);
    c.setAdapter(second, adapter);
    expect(c.group(first)?.members).toEqual([first, second]);
    expect(second.expanded).toBe(true);
    expect(first.result).toBe(retained);
    expect(second.outcome).toBe("failure");
    expect(first.origin).toBe("historical");
    expect(first.lifecycle).toBe("complete");
    expect(row.invalidate).toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("restores exploration groups when final results establish a previously unavailable contract", () => {
  const { coordinator: c, start } = fixture();
  try {
    const adapter = {
      id: "owner:search",
      family: "search" as const,
      exploration: (_args: unknown, value?: AgentToolResult<unknown>) =>
        value?.content[0]?.type === "text" && value.content[0].text === "search results"
          ? [{ label: "Search" as const, parts: [{ kind: "value" as const, text: "needle" }] }]
          : undefined
    };
    const calls = [0, 1].map((index) =>
      c.add(
        { messageTimestamp: 1, contentIndex: index, toolCallId: `search-${index}` },
        "search",
        { pattern: "needle" },
        adapter,
        "historical"
      )
    );
    expect(c.group(calls[0]!)).toBeUndefined();
    for (const call of calls) c.result(call, result("search results"), "success");
    expect(c.group(calls[0]!)?.members).toEqual(calls);
    c.result(calls[1]!, result("unsupported result"), "failure");
    expect(c.group(calls[0]!)?.members).toEqual([calls[0]]);
    c.result(calls[1]!, result("search results"), "success");
    expect(c.group(calls[0]!)?.members).toEqual(calls);
    expect(start).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("retains every ordered call and failure while expanding the group together", () => {
  const { coordinator: c, add } = fixture();
  const first = add("read", "/src/a.ts");
  c.result(first, result(), "success");
  const second = add("read", "/other/b.ts");
  const third = add("read", "/src/a.ts");
  c.result(third, result("third"), "success");
  c.result(second, result("denied"), "failure");
  const group = c.group(first)!;
  expect(group.members).toEqual([first, second, third]);
  expect(group.members.map((call) => call.outcome)).toEqual(["success", "failure", "success"]);
  const rows = group.members.map((call) => {
    const row = { invalidate: vi.fn(), setExpanded: vi.fn() };
    c.attach(call, row);
    return row;
  });
  c.expand(second, true);
  expect(group.members.every((call) => call.expanded)).toBe(true);
  for (const row of rows) expect(row.setExpanded).toHaveBeenCalledWith(true);
  c.expand(first, false);
  expect(group.members).toEqual([first, second, third]);
  c.boundary();
  const next = add("read", "c.ts");
  expect(c.group(next)).not.toBe(group);
  add("custom.read", "unknown");
  const afterCustom = add("read", "d.ts");
  expect(c.group(afterCustom)?.members).toEqual([afterCustom]);
  c.dispose();
});
it("applies global expansion once per group while keeping independent groups synchronized", () => {
  const { coordinator: c, add } = fixture();
  try {
    const first = add("read", "a.ts", "historical");
    const sibling = add("read", "b.ts", "historical");
    c.boundary();
    const separate = add("read", "c.ts", "historical");
    const calls = [first, sibling, separate];
    const rows = calls.map((call) => {
      const row = { invalidate: vi.fn(), setExpanded: vi.fn() };
      c.attach(call, row);
      return row;
    });
    // Pi's global action visits every row, including siblings of an expanded group.
    for (const expanded of [true, false]) {
      for (const call of calls) c.expand(call, expanded);
      for (const row of rows) {
        expect(row.setExpanded).toHaveBeenCalledExactlyOnceWith(expanded);
        row.setExpanded.mockClear();
      }
      expect(calls.every((call) => call.expanded === expanded)).toBe(true);
    }
  } finally {
    c.dispose();
  }
});
it("runs one scheduler only for known live activity, rejects late previews, and disposes row subscriptions", () => {
  const { coordinator: c, add, start, stop, tick } = fixture();
  const historical = add("read", "old", "historical");
  expect(isLive(historical)).toBe(false);
  expect(start).not.toHaveBeenCalled();
  const first = add("bash", "a"),
    second = add("bash", "b");
  expect(start).toHaveBeenCalledTimes(1);
  const row = { invalidate: vi.fn(), setExpanded: vi.fn() };
  c.attach(first, row);
  tick();
  expect(row.invalidate).toHaveBeenCalledTimes(1);
  c.preview(first, { text: "real chunks" });
  c.result(first, result("authoritative"), "success");
  c.preview(first, { text: "late" });
  c.update(first, "executing");
  c.result(first, result("late snapshot"), "success", true);
  expect(first.result).toEqual(result("authoritative"));
  expect(first.liveOutput).toBeUndefined();
  expect(stop).not.toHaveBeenCalled();
  c.settle();
  expect(second.lifecycle).toBe("unavailable");
  expect(second.outcome).toBe("unavailable");
  expect(stop).toHaveBeenCalledTimes(1);
  c.dispose();
  c.dispose();
  expect(stop).toHaveBeenCalledTimes(1);
});
it("keeps historical missing results still and separates identical call IDs by source position", () => {
  const { coordinator: c, start } = fixture();
  const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "duplicate" };
  const first = c.add(reference, "read", {}, nativeAdapter("read")!, "historical");
  c.add(reference, "read", { path: "prepared.ts" }, nativeAdapter("read")!, "historical");
  expect(c.group(first)?.members).toEqual([first]);
  const second = c.add(
    { ...reference, contentIndex: 1 },
    "read",
    { path: "other.ts" },
    nativeAdapter("read")!,
    "historical"
  );
  expect(first.key).not.toBe(second.key);
  expect(c.calls.size).toBe(2);
  expect(start).not.toHaveBeenCalled();
  expect(c.byId("orphan")).toBeUndefined();
  c.dispose();
});
