import { expect, it, vi } from "vite-plus/test";

import { nativeAdapter } from "../adapters/index.ts";
import { TranscriptCoordinator } from "./coordinator.ts";

const result = (text = "retained") => ({
  content: [{ type: "text" as const, text }],
  details: undefined
});

function rowHandle() {
  return { invalidate: vi.fn(), requestRender: vi.fn(), setExpanded: vi.fn() };
}

function fixture() {
  const start = vi.fn(() => () => {});
  const coordinator = new TranscriptCoordinator("runtime", {
    animationClock: { start }
  });

  return { coordinator, start };
}

it("rejects foreign and disposed call updates without changing retained views or notifying rows", () => {
  const { coordinator: c } = fixture();
  const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "owned" };
  const call = c.add({
    reference,
    name: "bash",
    args: {},
    adapter: nativeAdapter("bash")!,
    origin: "live"
  });
  const row = rowHandle();
  c.attach(call, row);
  reference.toolCallId = "changed by caller";
  expect(call.reference.toolCallId).toBe("owned");
  const retained = { ...call };

  const update = (view: typeof call) => {
    c.setReferenceEntry(view, "late-entry");
    c.setSavedPath(view, "/late");
    c.setSavedOutput(view, { path: "/late", text: "late preview" });
    c.fact(view, { kind: "change", change: "unavailable", reason: "binary" });
    c.result(view, result("late result"), { outcome: "failure" });
    c.expand(view, true);
  };

  try {
    update(retained);
    expect(call).toEqual(retained);
    c.dispose();
    update(call);
    expect(call).toEqual(retained);
    expect(c.calls.size).toBe(0);
    expect(row.invalidate).not.toHaveBeenCalled();
    expect(row.setExpanded).not.toHaveBeenCalled();
  } finally {
    c.dispose();
  }
});

it("keeps historical missing results still and separates identical call IDs by source position", () => {
  const { coordinator: c, start } = fixture();
  const reference = { messageTimestamp: 1, contentIndex: 0, toolCallId: "duplicate" };
  const first = c.add({
    reference,
    name: "read",
    args: {},
    adapter: nativeAdapter("read")!,
    origin: "historical"
  });
  c.add({
    reference,
    name: "read",
    args: { path: "prepared.ts" },
    adapter: nativeAdapter("read")!,
    origin: "historical"
  });
  expect(c.group(first)).toBeUndefined();
  const second = c.add({
    reference: { ...reference, contentIndex: 1 },
    name: "read",
    args: { path: "other.ts" },
    adapter: nativeAdapter("read")!,
    origin: "historical"
  });
  expect(first.key).not.toBe(second.key);
  expect(c.calls.size).toBe(2);
  expect(start).not.toHaveBeenCalled();
  expect(c.byId("orphan")).toBeUndefined();
  c.dispose();
});
