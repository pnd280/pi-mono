import { fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { nativeAdapter } from "../adapters/index.ts";
import type { OperationFact } from "../contracts.ts";
import { assistantMessage } from "../test-fixture.ts";
import { DisplaySession, type ToolSnapshot } from "./session.ts";

/** A registry snapshot whose validation keeps the raw arguments. */
function tools(adapter: ToolSnapshot["adapter"]): () => ToolSnapshot {
  return () => ({ adapter, args: (_name, args) => args });
}

function fixture(options: Partial<ConstructorParameters<typeof DisplaySession>[0]> = {}) {
  return new DisplaySession({
    runtime: "session",
    cwd: "/tmp",
    history: { getBranch: () => [], getLeafId: () => null, getEntry: () => undefined },
    tools: tools(nativeAdapter),
    expanded: () => false,
    warn() {},
    ...options
  });
}

const operation = (fact: Omit<OperationFact, "kind">): OperationFact => ({
  kind: "operation",
  ...fact
});

it("makes retained observation callbacks inert after session disposal, including persistence", () => {
  const history = SessionManager.inMemory("/tmp");
  history.appendMessage(assistantMessage([fauxToolCall("bash", {}, { id: "shell" })]));
  const append = vi.fn();
  const session = fixture({ history, append });

  try {
    session.message(
      {
        kind: "assistant",
        source: {},
        timestamp: 1,
        calls: [{ index: 0, id: "shell", name: "bash", args: {} }]
      },
      "live"
    );
    const call = session.coordinator.byId("shell")!;
    const observation = session.beginObservation("shell", "pi:bash")!;
    observation.started();
    observation.preview({ text: "live preview" });
    observation.fact(operation({ outcome: "failure", exitCode: 1 }));
    expect(call.lifecycle).toBe("executing");
    expect(call.liveOutput?.text).toBe("live preview");
    const retained = { ...call };
    session.dispose();
    observation.started();
    observation.preview({ text: "late preview" });
    observation.fact(operation({ outcome: "success", exitCode: 0 }));
    expect(call).toEqual(retained);
    expect(append).not.toHaveBeenCalled();
    expect(session.beginObservation("shell", "pi:bash")).toBeUndefined();
    expect(session.coordinator.calls.size).toBe(0);
  } finally {
    session.dispose();
  }
});
