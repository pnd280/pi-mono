import { expect, it, vi } from "vite-plus/test";

import { genericAdapter } from "../adapters/generic.ts";
import { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { TranscriptRows } from "./rows.ts";

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
  const rows = new TranscriptRows({}, coordinator, () => true);
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
