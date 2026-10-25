import { fauxToolCall, type JsonObject, type JsonValue } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import { genericAdapter, nativeAdapter, piFffAdapter, piMcpAdapter } from "../adapters/index.ts";
import { mcpToolInfo } from "../adapters/pi-mcp-adapter/test-fixture.ts";
import {
  isCancelled,
  type DisplayCall,
  type DisplayFact,
  type OperationFact,
  type Outcome,
  type SavedOutput
} from "../contracts.ts";
import { loadDisplaySettings } from "../settings.ts";
import { assistantMessage } from "../test-fixture.ts";
import { TranscriptMessages } from "./messages.ts";
import { CALL_TYPE } from "./metadata.ts";
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
    settings: loadDisplaySettings([]),
    tools: tools(nativeAdapter),
    expanded: () => false,
    warn() {},
    ...options
  });
}

const result = (path: string) => ({
  content: [{ type: "text" as const, text: "published result" }],
  details: { fullOutputPath: path }
});

const operation = (fact: Omit<OperationFact, "kind">): OperationFact => ({
  kind: "operation",
  ...fact
});

type LiveCall = {
  id: string;
  name: string;
  args: JsonObject;
  facts: readonly DisplayFact[];
  /** The execution event's outcome; Pi's entry keeps only its error flag. */
  outcome: Outcome | undefined;
  details?: JsonValue;
  timestamp?: number;
  /** Pi's measurement; absent when the tool did not run. */
  durationMs?: number;
};

/**
 * Pi's order: the assistant entry, the start event, observation, the end event, the
 * result message, and then its entry. An undefined outcome stops before the end event.
 */
function runLive(session: DisplaySession, history: SessionManager, call: LiveCall): DisplayCall {
  const { id, name, args, outcome, timestamp = 1, durationMs } = call;
  const published = {
    content: [{ type: "text" as const, text: "published body" }],
    details: call.details
  };
  history.appendMessage(assistantMessage([fauxToolCall(name, args, { id })], timestamp));
  session.message({ kind: "assistant", timestamp, calls: [{ index: 0, id, name, args }] }, "live");
  session.queued(id);
  const sink = session.beginObservation(id, `pi:${name}`)!;
  for (const fact of call.facts) sink.fact(fact);

  if (outcome) {
    session.result(id, published, { outcome, durationMs });
    const isError = outcome !== "success";
    session.message(
      {
        kind: "result",
        id,
        name,
        result: published,
        outcome: isError ? "failure" : "success",
        ...(durationMs === undefined ? {} : { durationMs })
      },
      "live"
    );
    history.appendMessage({
      role: "toolResult",
      toolCallId: id,
      toolName: name,
      content: published.content,
      ...(call.details === undefined ? {} : { details: call.details }),
      ...(durationMs === undefined ? {} : { durationMs }),
      isError,
      timestamp
    });
  }

  return session.coordinator.byId(id)!;
}

/** Rebuild a display from Pi's entries, as the host does after a reload. */
function replay(history: SessionManager, options: Parameters<typeof fixture>[0] = {}) {
  const session = fixture({ history, ...options });
  const messages = new TranscriptMessages();
  session.reconstruct(() => {
    for (const entry of history.getBranch())
      if (entry.type === "message") session.message(messages.read(entry.message), "historical");
  });

  return session;
}

it("replays saved facts and Pi's durations for separate assistant calls sharing a timestamp", () => {
  const history = SessionManager.inMemory("/tmp");
  const live = fixture({ history, append: history.appendCustomEntry.bind(history) });
  const calls = [
    ["first", 2],
    ["second", 3]
  ] as const;

  for (const [id, exitCode] of calls)
    runLive(live, history, {
      id,
      name: "bash",
      args: {},
      facts: [operation({ outcome: "failure", exitCode })],
      outcome: "failure",
      timestamp: 17,
      durationMs: exitCode
    });
  const change = {
    kind: "change",
    change: "creation",
    patch: "@@ -0,0 +1,1 @@\n+after\n"
  } as const;
  runLive(live, history, {
    id: "unfinished-write",
    name: "write",
    args: { path: "unfinished.txt", content: "after\n" },
    facts: [change, operation({ outcome: "success" })],
    outcome: undefined,
    timestamp: 17
  });
  live.dispose();
  const restored = replay(history);

  try {
    for (const [id, exitCode] of calls)
      expect(restored.coordinator.byId(id)).toMatchObject({
        operation: operation({ outcome: "failure", exitCode }),
        durationMs: exitCode
      });
    const unfinished = restored.coordinator.byId("unfinished-write")!;
    expect(unfinished).toMatchObject({
      lifecycle: "unavailable",
      outcome: "unavailable",
      change,
      operation: operation({ outcome: "success" })
    });
    expect(unfinished.durationMs).toBeUndefined();
  } finally {
    restored.dispose();
  }
});

it.each(["host", "operation"] as const)(
  "replays %s cancellation for any renderer, separately from the published result",
  (source) => {
    const history = SessionManager.inMemory("/tmp");
    const live = fixture({ history, append: history.appendCustomEntry.bind(history) });
    runLive(live, history, {
      id: "cancelled",
      name: "bash",
      args: { command: "sleep 1" },
      facts: source === "operation" ? [operation({ outcome: "cancelled" })] : [],
      outcome: source === "host" ? "cancelled" : "failure"
    });
    live.dispose();
    const restored = replay(history, { tools: tools(() => genericAdapter) });

    try {
      const call = restored.coordinator.byId("cancelled")!;
      expect(call.adapter.id).toBe("generic");
      expect(call.outcome).toBe("failure");
      expect(call.result?.content).toEqual([{ type: "text", text: "published body" }]);
      expect(isCancelled(call)).toBe(true);
    } finally {
      restored.dispose();
    }
  }
);

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
      tools: tools(() => (available ? adapter : genericAdapter)),
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
  const history = SessionManager.inMemory("/tmp");
  const args = { command: "echo retained" };
  const entry = history.appendMessage(
    assistantMessage([fauxToolCall("bash", args, { id: "late-native" })])
  );
  history.appendCustomEntry(CALL_TYPE, { entry, toolCallId: "late-native", operation: true });
  const published = result("published-output");
  history.appendMessage({
    role: "toolResult",
    toolCallId: "late-native",
    toolName: "bash",
    ...published,
    isError: false,
    durationMs: 12,
    timestamp: 1
  });
  const file = files();
  const append = vi.fn();
  let available = false;
  const session = fixture({
    history,
    tools: tools((name) => (available ? nativeAdapter(name) : genericAdapter)),
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
    session.result("late-native", published, { outcome: "success", durationMs: 12 });
    const call = session.coordinator.byId("late-native")!;
    expect(call.operation).toBeUndefined();
    expect(file.read).not.toHaveBeenCalled();
    available = true;
    session.refreshAdapters();
    expect(call.operation).toEqual(operation({ outcome: "success", exitCode: 0 }));
    expect(call.durationMs).toBe(12);
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
  const history = SessionManager.inMemory("/tmp");
  history.appendMessage(assistantMessage([fauxToolCall("bash", {}, { id: "shell" })]));
  const append = vi.fn();
  const session = fixture({ history, append });

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
    observation.fact(operation({ outcome: "failure", exitCode: 1 }));
    expect(call.lifecycle).toBe("executing");
    expect(call.liveOutput?.text).toBe("live preview");
    const retained = { ...call };
    // A call still running at disposal keeps the facts known so far.
    session.dispose();
    const flushed = append.mock.calls.slice();
    expect(flushed).toEqual([[CALL_TYPE, expect.objectContaining({ toolCallId: "shell" })]]);
    observation.started();
    observation.preview({ text: "late preview" });
    observation.fact(operation({ outcome: "success", exitCode: 0 }));
    expect(call).toEqual(retained);
    expect(append.mock.calls).toEqual(flushed);
    expect(session.beginObservation("shell", "pi:bash")).toBeUndefined();
    expect(session.coordinator.calls.size).toBe(0);
  } finally {
    session.dispose();
  }
});
