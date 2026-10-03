import { fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import { genericAdapter, nativeAdapter, piFffAdapter, piMcpAdapter } from "../adapters/index.ts";
import { mcpToolInfo } from "../adapters/pi-mcp-adapter/test-fixture.ts";
import { isCancelled, type DisplayCall, type SavedOutput } from "../contracts.ts";
import { loadDisplaySettings } from "../settings.ts";
import { assistantMessage } from "../test-fixture.ts";
import { METADATA_TYPE } from "./metadata.ts";
import { DisplaySession } from "./session.ts";

function fixture(options: Partial<ConstructorParameters<typeof DisplaySession>[0]> = {}) {
  return new DisplaySession({
    runtime: "session",
    cwd: "/tmp",
    history: { getBranch: () => [], getLeafId: () => null, getEntry: () => undefined },
    settings: loadDisplaySettings([]),
    selectAdapter: nativeAdapter,
    expanded: () => false,
    ...options
  });
}

function shellCall(
  session: DisplaySession,
  id: string,
  origin: DisplayCall["origin"] = "historical"
) {
  session.message(
    {
      kind: "assistant",
      timestamp: 1,
      calls: [{ index: 0, id, name: "bash", args: { command: `echo ${id}` } }]
    },
    origin
  );

  return session.coordinator.byId(id)!;
}

const result = (path: string) => ({
  content: [{ type: "text" as const, text: "published result" }],
  details: { fullOutputPath: path }
});

it("replays facts for separate assistant calls sharing a timestamp", () => {
  const history = SessionManager.inMemory();
  for (const id of ["first", "second"])
    history.appendMessage(assistantMessage([fauxToolCall("bash", {}, { id })], 17));
  const append = vi.fn(history.appendCustomEntry.bind(history));
  const live = fixture({ history, append });
  const message = (id: string) => ({
    kind: "assistant" as const,
    timestamp: 17,
    calls: [{ index: 0, id, name: "bash", args: {} }]
  });

  try {
    live.message(message("first"), "live");
    live.beginObservation("first", "pi:bash")!.fact({
      kind: "operation",
      availability: "available",
      durationMs: 12,
      outcome: "success"
    });
    expect(append).toHaveBeenCalledOnce();
  } finally {
    live.dispose();
  }

  const replay = fixture({ history });

  try {
    replay.message(message("first"), "historical");
    expect(replay.coordinator.byId("first")?.operation?.durationMs).toBe(12);
  } finally {
    replay.dispose();
  }
});

function files() {
  const pending = new Map<string, (output: SavedOutput) => void>();
  const read = vi.fn(
    (path: string) => new Promise<SavedOutput>((resolve) => pending.set(path, resolve))
  );

  const resolve = (path: string) => {
    const file = pending.get(path);
    if (!file) throw new Error(`No pending preview: ${path}`);
    file({ path, text: `preview:${path}` });
  };

  return {
    read,
    async complete(path: string) {
      resolve(path);
      // Drain loader completion and session publication without timer-based polling.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };
}

it.each(["host", "operation"])(
  "retains %s cancellation separately from published results and renderer selection",
  (source) => {
    const history = SessionManager.inMemory();
    history.appendMessage(
      assistantMessage([fauxToolCall("bash", { command: "echo cancelled" }, { id: "cancelled" })])
    );
    const appendEntry = vi.fn(history.appendCustomEntry.bind(history));
    const live = fixture({ history, append: appendEntry });
    const published = {
      content: [{ type: "text" as const, text: "middleware diagnostic" }],
      details: undefined
    };

    try {
      const call = shellCall(live, "cancelled", "live");
      if (source === "operation") {
        live.beginObservation("cancelled", "pi:bash")!.fact({
          kind: "operation",
          availability: "available",
          durationMs: 1,
          outcome: "cancelled"
        });
        live.result("cancelled", published, "failure");
      } else live.result("cancelled", published, "cancelled");
      live.message(
        {
          kind: "result",
          id: "cancelled",
          name: call.name,
          result: published,
          outcome: "failure"
        },
        "live"
      );
      expect(call.result).toBe(published);
      expect(call.outcome).toBe("failure");
      expect(isCancelled(call)).toBe(true);
      expect(appendEntry).toHaveBeenCalledOnce();
      const replay = fixture({ history, append: appendEntry, selectAdapter: () => genericAdapter });

      try {
        const retained = shellCall(replay, "cancelled");
        replay.result("cancelled", published, "failure");
        expect(retained.adapter.id).toBe("generic");
        expect(retained.outcome).toBe("failure");
        expect(isCancelled(retained)).toBe(true);
        expect(appendEntry).toHaveBeenCalledOnce();
      } finally {
        replay.dispose();
      }
    } finally {
      live.dispose();
    }
  }
);

it("validates facts only for requested historical calls, including cancellation from other adapters", () => {
  const history = SessionManager.inMemory();
  const hidden = vi.fn(() => ({
    kind: "change",
    availability: "available",
    patch: "x".repeat(64 * 1024)
  }));
  const retained = vi.fn(() => 1);
  const operation = {
    kind: "operation",
    availability: "available",
    outcome: "cancelled",
    get durationMs() {
      return retained();
    }
  };

  for (const [index, fact] of [hidden, () => operation].entries()) {
    const id = `call-${index}`;
    const messageEntryId = history.appendMessage(
      assistantMessage([fauxToolCall("bash", {}, { id })], index)
    );
    history.appendCustomEntry(METADATA_TYPE, {
      version: 1,
      call: { messageTimestamp: index, contentIndex: 0, toolCallId: id, messageEntryId },
      adapter: "pi:bash",
      get fact() {
        return fact();
      }
    });
  }

  const session = fixture({ history, selectAdapter: () => genericAdapter });

  try {
    expect(hidden).not.toHaveBeenCalled();
    expect(retained).not.toHaveBeenCalled();
    const call = shellCall(session, "call-1");
    expect(isCancelled(call)).toBe(true);
    expect(hidden).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalled();
    retained.mockClear();
    shellCall(session, "call-1");
    expect(retained).not.toHaveBeenCalled();
  } finally {
    session.dispose();
  }
});

it.each(["historical"] as const)(
  "loads an initially expanded %s call on completion without a host reconstruction scan",
  async (origin) => {
    const file = files();
    const session = fixture({ readSavedOutput: file.read, expanded: () => true });

    try {
      const call = shellCall(session, origin, origin);
      expect(file.read).not.toHaveBeenCalled();
      session.result(origin, result("completed-output"), "success");
      expect(file.read).toHaveBeenCalledExactlyOnceWith("completed-output");
      await file.complete("completed-output");
      expect(call.savedOutput?.text).toBe("preview:completed-output");
    } finally {
      session.dispose();
    }
  }
);

it.each(["fff", "mcp"] as const)(
  "enriches late %s selection from retained data without observing history or copying results",
  (owner) => {
    const fff = owner === "fff";
    const adapter = fff ? piFffAdapter(fffToolInfo("ffgrep"))! : piMcpAdapter(mcpToolInfo())!;
    const name = fff ? "ffgrep" : "mcp";
    const args = fff ? { pattern: "needle" } : { tool: "search", server: "docs", args: {} };
    const published = {
      content: [{ type: "text" as const, text: "retained result" }],
      details: fff
        ? { totalMatched: 1, totalFiles: 1 }
        : { mode: "call", server: "docs", tool: "search" }
    };
    const file = files();
    const append = vi.fn();
    let available = false;
    const session = fixture({
      selectAdapter: () => (available ? adapter : genericAdapter),
      readSavedOutput: file.read,
      append
    });

    try {
      session.message(
        { kind: "assistant", timestamp: 1, calls: [{ index: 0, id: name, name, args }] },
        "historical"
      );
      session.message(
        { kind: "result", id: name, name, result: published, outcome: "success" },
        "historical"
      );
      const call = session.coordinator.byId(name)!;
      expect(call.adapter.id).toBe("generic");
      expect(session.coordinator.group(call)).toBeUndefined();
      available = true;
      session.refreshAdapters();
      expect(call.adapter.id).toBe(adapter.id);
      expect(call.args).toBe(args);
      expect(call.result).toBe(published);
      expect(call.origin).toBe("historical");
      expect(call.lifecycle).toBe("complete");
      expect(call.outcome).toBe("success");
      if (fff) expect(session.coordinator.group(call)).toBeUndefined();
      else
        expect(call.adapter.mcp?.(args, published)).toMatchObject({
          server: "docs",
          tool: "search",
          outcome: "success"
        });
      session.coordinator.expand(call, true);
      expect(file.read).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
      expect(session.beginObservation(name, adapter.id)).toBeUndefined();
    } finally {
      session.dispose();
    }
  }
);

it("restores native facts and eligible saved previews after late contract selection", async () => {
  const history = SessionManager.inMemory();
  const args = { command: "echo retained" };
  const messageEntryId = history.appendMessage(
    assistantMessage([fauxToolCall("bash", args, { id: "late-native" })])
  );
  const operation = {
    kind: "operation",
    availability: "available",
    durationMs: 12,
    outcome: "success"
  };
  history.appendCustomEntry(METADATA_TYPE, {
    version: 1,
    call: { messageEntryId, messageTimestamp: 1, contentIndex: 0, toolCallId: "late-native" },
    adapter: "pi:bash",
    fact: operation
  });
  const file = files();
  const append = vi.fn();
  let available = false;
  const session = fixture({
    history,
    selectAdapter: (name) => (available ? nativeAdapter(name) : genericAdapter),
    expanded: () => true,
    readSavedOutput: file.read,
    append
  });

  try {
    session.message(
      {
        kind: "assistant",
        timestamp: 1,
        calls: [{ index: 0, id: "late-native", name: "bash", args }]
      },
      "historical"
    );
    const published = result("published-output");
    session.result("late-native", published, "success");
    const call = session.coordinator.byId("late-native")!;
    expect(call.operation).toBeUndefined();
    expect(file.read).not.toHaveBeenCalled();
    available = true;
    session.refreshAdapters();
    expect(call.operation).toEqual(operation);
    expect(file.read).toHaveBeenCalledExactlyOnceWith("published-output");
    await file.complete("published-output");
    expect(call.savedOutput?.text).toBe("preview:published-output");
    expect(call.args).toBe(args);
    expect(call.result).toBe(published);
    expect(session.beginObservation("late-native", "pi:bash")).toBeUndefined();
    expect(append).not.toHaveBeenCalled();
  } finally {
    session.dispose();
  }
});

it("makes retained observation callbacks inert after session disposal, including persistence", () => {
  const append = vi.fn();
  const session = fixture({ append });

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
