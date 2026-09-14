import { expect, it, vi } from "vite-plus/test";

import { nativeAdapter } from "../adapters/index.ts";
import { loadDisplaySettings } from "../settings.ts";
import { DisplaySession } from "./session.ts";

it("makes retained observation callbacks inert after session disposal, including persistence", () => {
  const append = vi.fn();
  const session = new DisplaySession({
    runtime: "session",
    history: { getBranch: () => [], getLeafId: () => null, getEntry: () => undefined },
    settings: loadDisplaySettings([]),
    selectAdapter: nativeAdapter,
    expanded: () => false,
    append
  });

  try {
    session.message(
      {
        kind: "assistant",
        timestamp: 1,
        calls: [{ index: 0, id: "shell", name: "bash", args: {} }]
      },
      "live"
    );
    const call = session.coordinator.byId("shell")!;
    const observation = session.beginObservation("shell", "pi:bash")!;
    observation.started();
    observation.preview({ text: "live preview" });
    observation.fact({
      kind: "operation",
      availability: "available",
      durationMs: 10,
      outcome: "success"
    });
    expect(call.lifecycle).toBe("executing");
    expect(call.liveOutput?.text).toBe("live preview");
    expect(append).toHaveBeenCalledOnce();
    const retained = { ...call };
    session.dispose();
    observation.started();
    observation.preview({ text: "late preview" });
    observation.fact({
      kind: "operation",
      availability: "available",
      durationMs: 20,
      outcome: "failure"
    });
    expect(call).toEqual(retained);
    expect(append).toHaveBeenCalledOnce();
    expect(session.beginObservation("shell", "pi:bash")).toBeUndefined();
    expect(session.coordinator.calls.size).toBe(0);
  } finally {
    session.dispose();
  }
});
