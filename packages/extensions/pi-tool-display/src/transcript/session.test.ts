import { fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { fffToolInfo } from "../adapters/@ff-labs/pi-fff/test-fixture.ts";
import { genericAdapter, nativeAdapter, piFffAdapter, piMcpAdapter } from "../adapters/index.ts";
import { mcpToolInfo } from "../adapters/pi-mcp-adapter/test-fixture.ts";
import { isCancelled, type DisplayCall, type SavedOutput } from "../contracts.ts";
import { SAVED_OUTPUT_CACHE_ENTRIES } from "../observation/saved-output.ts";
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

it("keeps streamed calls current without reselecting adapters on every update", () => {
  const selectAdapter = vi.fn(nativeAdapter);
  const session = fixture({ selectAdapter });
  const calls = Array.from({ length: 50 }, (_, index) => ({
    index,
    id: `call-${index}`,
    name: "grep",
    args: { pattern: `pattern-${index}`, path: "src" }
  }));
  const message = { kind: "assistant" as const, timestamp: 1, calls };

  try {
    session.message(message, "live", false);
    const displayed = calls.map((call) => session.coordinator.byId(call.id)!);

    for (let update = 0; update < 100; update++) session.message(message, "live", false);
    expect(selectAdapter.mock.calls.length).toBeLessThan(100);
    expect(session.coordinator.group(displayed[0]!)?.members).toHaveLength(calls.length);

    const changed = { ...calls.at(-1)!, args: { pattern: "changed", path: "src" } };
    session.message({ ...message, calls: [changed] }, "live", false);
    expect(session.coordinator.byId(changed.id)).toBe(displayed.at(-1));
    expect(displayed.at(-1)?.args).toEqual(changed.args);
    expect(displayed[0]?.args).toEqual(calls[0]?.args);

    session.message({ ...message, calls: [...calls.slice(0, -1), changed] }, "live", true);
    expect(displayed.at(-1)?.args).toEqual(changed.args);
    expect(session.coordinator.group(displayed[0]!)?.members).toHaveLength(calls.length);
    expect(selectAdapter.mock.calls.length).toBeLessThan(100);
  } finally {
    session.dispose();
  }
});

function files() {
  const pending = new Map<string, (output: SavedOutput) => void>();
  const read = vi.fn(
    (path: string) => new Promise<SavedOutput>((resolve) => pending.set(path, resolve))
  );

  const resolve = (path: string, notice?: string) => {
    const file = pending.get(path);
    if (!file) throw new Error(`No pending preview: ${path}`);
    file({ path, text: `preview:${path}`, ...(notice ? { notice } : {}) });
  };

  return {
    read,
    resolve,
    async complete(path: string, notice?: string) {
      resolve(path, notice);
      // Drain loader completion, eviction, and session publication without timer-based polling.
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
        expect(retained.adapter).toBe(genericAdapter);
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

it("loads on transcript expansion without Pi rows, but never while collapsed or still executing", async () => {
  const file = files();
  const session = fixture({ readSavedOutput: file.read });

  try {
    const call = shellCall(session, "live", "live");
    session.result("live", result("live-output"), "success", true);
    session.coordinator.expand(call, true);
    expect(file.read).not.toHaveBeenCalled();
    session.coordinator.expand(call, false);
    session.result("live", result("live-output"), "failure");
    expect(file.read).not.toHaveBeenCalled();
    session.coordinator.expand(call, true);
    expect(file.read).toHaveBeenCalledExactlyOnceWith("live-output");
    await file.complete("live-output");
    expect(call.savedOutput?.text).toBe("preview:live-output");
    expect(call.outcome).toBe("failure");
    expect(call.result?.content).toEqual(result("live-output").content);
    session.coordinator.expand(call, false);
    session.coordinator.expand(call, true);
    expect(file.read).toHaveBeenCalledOnce();
  } finally {
    session.dispose();
  }
});

it.each(["live", "historical"] as const)(
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

it("requires another expansion after read saturation even when capacity becomes available", async () => {
  const file = files();
  const session = fixture({ readSavedOutput: file.read, expanded: () => true });

  try {
    const calls = Array.from({ length: SAVED_OUTPUT_CACHE_ENTRIES + 1 }, (_, index) => {
      const call = shellCall(session, String(index));
      session.result(String(index), result(String(index)), "success");

      return call;
    });
    expect(file.read).toHaveBeenCalledTimes(SAVED_OUTPUT_CACHE_ENTRIES);
    await file.complete("0");
    const waiting = calls.at(-1)!;
    expect(waiting.savedOutput?.retryable).toBe(true);
    expect(waiting.savedOutput?.notice).toContain("expand again");
    expect(file.read).toHaveBeenCalledTimes(SAVED_OUTPUT_CACHE_ENTRIES);
    session.coordinator.expand(waiting, true);
    expect(file.read).toHaveBeenCalledTimes(SAVED_OUTPUT_CACHE_ENTRIES);
    session.coordinator.expand(waiting, false);
    session.coordinator.expand(waiting, true);
    expect(file.read).toHaveBeenCalledTimes(SAVED_OUTPUT_CACHE_ENTRIES + 1);
    expect(waiting.savedOutput).toBeUndefined();
    expect(waiting.result?.content).toEqual(result(String(SAVED_OUTPUT_CACHE_ENTRIES)).content);
    await file.complete(String(SAVED_OUTPUT_CACHE_ENTRIES));
    expect(waiting.savedOutput?.text).toBe(`preview:${SAVED_OUTPUT_CACHE_ENTRIES}`);
  } finally {
    session.dispose();
  }
});

it("shares pending previews, clears every evicted call, and reloads only on re-expansion", async () => {
  const file = files();
  const session = fixture({ readSavedOutput: file.read, expanded: () => true });

  try {
    const shared = ["first", "second"].map((id) => {
      const call = shellCall(session, id);
      session.result(id, result("shared"), "success");

      return call;
    });
    expect(file.read).toHaveBeenCalledExactlyOnceWith("shared");
    await file.complete("shared");
    expect(shared.map((call) => call.savedOutput?.text)).toEqual([
      "preview:shared",
      "preview:shared"
    ]);

    for (let index = 0; index < SAVED_OUTPUT_CACHE_ENTRIES; index++) {
      const id = String(index);
      shellCall(session, id);
      session.result(id, result(id), "success");
      await file.complete(id);
    }

    expect(shared.map((call) => call.savedOutput)).toEqual([undefined, undefined]);
    const loads = file.read.mock.calls.length;
    const first = shared[0]!;
    session.coordinator.expand(first, false);
    session.coordinator.expand(first, true);
    expect(file.read).toHaveBeenCalledTimes(loads + 1);
    await file.complete("shared");
    expect(first.savedOutput?.text).toBe("preview:shared");
    expect(shared[1]!.savedOutput).toBeUndefined();
  } finally {
    session.dispose();
  }
});

it("rejects cached previews evicted before publication and retries them on expansion", async () => {
  const file = files();
  const session = fixture({ readSavedOutput: file.read, expanded: () => true });

  const add = (id: string, path = id) => {
    const call = shellCall(session, id);
    session.result(id, result(path), "success");

    return call;
  };

  try {
    for (let index = 0; index < SAVED_OUTPUT_CACHE_ENTRIES; index++) {
      add(String(index));
      await file.complete(String(index));
    }

    for (let index = SAVED_OUTPUT_CACHE_ENTRIES; index < SAVED_OUTPUT_CACHE_ENTRIES * 2; index++)
      add(String(index));
    for (let index = SAVED_OUTPUT_CACHE_ENTRIES; index < SAVED_OUTPUT_CACHE_ENTRIES * 2; index++)
      file.resolve(String(index));
    // All replacement completions precede this cache hit's publication microtask.
    const reused = add("reuse", "0");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(session.coordinator.byId("0")?.savedOutput).toBeUndefined();
    expect(reused.savedOutput).toBeUndefined();
    expect([...session.coordinator.calls.values()].filter((call) => call.savedOutput)).toHaveLength(
      SAVED_OUTPUT_CACHE_ENTRIES
    );

    const reads = file.read.mock.calls.length;
    session.coordinator.expand(reused, false);
    session.coordinator.expand(reused, true);
    expect(file.read).toHaveBeenCalledTimes(reads + 1);
    await file.complete("0");
    expect(reused.savedOutput?.text).toBe("preview:0");
    expect(session.coordinator.byId("0")?.savedOutput).toBeUndefined();
  } finally {
    session.dispose();
  }
});

it.each(["result", "fact"] as const)(
  "discards a completed preview before publishing a replacement saved-output %s",
  async (source) => {
    const file = files();
    const session = fixture({ readSavedOutput: file.read, expanded: () => true });

    try {
      const call = shellCall(session, "changing", "live");
      const original = result("old");
      session.result("changing", original, "failure");
      await file.complete("old", "Old preview is bounded.");
      expect(call.savedOutput).toMatchObject({
        text: "preview:old",
        notice: "Old preview is bounded."
      });
      const published = source === "result" ? result("current") : original;
      const updates: { path: string | undefined; preview: SavedOutput | undefined }[] = [];
      session.coordinator.attach(call, {
        invalidate: () => updates.push({ path: call.savedPath, preview: call.savedOutput }),
        requestRender() {},
        setExpanded() {}
      });

      if (source === "result") session.result("changing", published, "failure");
      else
        session.beginObservation("changing", "pi:bash")!.fact({
          kind: "saved-output",
          availability: "available",
          path: "current"
        });

      expect(updates.length).toBeGreaterThan(0);
      for (const update of updates) expect(update).toEqual({ path: "current", preview: undefined });
      expect(call.savedOutput).toBeUndefined();
      expect(call.result).toBe(published);
      expect(call.outcome).toBe("failure");

      if (source === "fact") {
        // Facts do not initiate reads; the next eligible expansion loads their path.
        expect(file.read).toHaveBeenCalledOnce();
        session.coordinator.expand(call, false);
        session.coordinator.expand(call, true);
      }

      expect(file.read).toHaveBeenLastCalledWith("current");
      expect(call.savedOutput).toBeUndefined();
      expect(call.result).toBe(published);
      await file.complete("current");
      expect(call.savedOutput).toEqual({ path: "current", text: "preview:current" });
      expect(call.result).toBe(published);
    } finally {
      session.dispose();
    }
  }
);

it("rejects old-path and disposed-session preview completions without altering published results", async () => {
  const file = files();
  const session = fixture({ readSavedOutput: file.read, expanded: () => true });

  try {
    const call = shellCall(session, "changing");
    session.result("changing", result("old"), "success");
    const published = result("current");
    session.result("changing", published, "failure");
    await file.complete("old");
    expect(call.savedOutput).toBeUndefined();
    expect(call.savedPath).toBe("current");
    expect(call.result).toBe(published);
    session.dispose();
    const retained = { ...call };
    await file.complete("current");
    expect(call).toEqual(retained);
    expect(session.coordinator.calls.size).toBe(0);
  } finally {
    session.dispose();
  }
});

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
      expect(call.adapter).toBe(genericAdapter);
      expect(session.coordinator.group(call)).toBeUndefined();
      available = true;
      session.refreshAdapters();
      expect(call.adapter).toBe(adapter);
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

it("makes retained observation callbacks inert after session disposal, including persistence", () => {
  const append = vi.fn();
  const session = new DisplaySession({
    runtime: "session",
    cwd: "/tmp",
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
