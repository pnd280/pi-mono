import { fauxToolCall, type JsonObject, type JsonValue } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { nativeAdapter } from "../adapters/index.ts";
import {
  isCancelled,
  type DisplayCall,
  type DisplayFact,
  type OperationFact,
  type Outcome
} from "../contracts.ts";
import { parseRetainedPatch } from "../diff.ts";
import { assistantMessage } from "../test-fixture.ts";
import { TranscriptCoordinator } from "./coordinator.ts";
import { DisplayHistory } from "./history.ts";
import { CALL_TYPE } from "./metadata.ts";
import { SavedCalls, type SavedCallsOptions } from "./saved-calls.ts";

type Fixture = { coordinator: TranscriptCoordinator; saved: SavedCalls; dispose(): void };

function fixture(
  history: SessionManager,
  options: Partial<Pick<SavedCallsOptions, "append" | "warn">> = {}
): Fixture {
  const coordinator = new TranscriptCoordinator("saved-calls", { cwd: "/tmp" });
  const saved = new SavedCalls({
    coordinator,
    history: new DisplayHistory(history),
    append: options.append,
    warn: options.warn ?? (() => {})
  });

  return {
    coordinator,
    saved,
    dispose() {
      saved.dispose();
      coordinator.dispose();
    }
  };
}

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
  /** False stops after the end event, as when shutdown precedes Pi's final result. */
  final?: boolean | undefined;
  details?: JsonValue;
  /** Pi's measurement; absent when the tool did not run. */
  durationMs?: number | undefined;
};

/**
 * Pi's order: the assistant entry, the start event, observation, the end event, the
 * result message, and then its entry. An undefined outcome stops before the end event.
 */
function runLive({ coordinator, saved }: Fixture, history: SessionManager, input: LiveCall) {
  const { id, name, args, outcome, durationMs } = input;
  const published = {
    content: [{ type: "text" as const, text: "published body" }],
    details: input.details
  };
  history.appendMessage(assistantMessage([fauxToolCall(name, args, { id })], 1));
  const call = coordinator.add({
    reference: { messageTimestamp: 1, contentIndex: 0, toolCallId: id },
    name,
    args,
    adapter: nativeAdapter(name)!,
    origin: "live"
  });
  saved.observe(call);
  for (const fact of input.facts) saved.fact(call, fact);
  if (!outcome) return call;

  // The end event shows a host cancellation on the live card.
  if (outcome === "cancelled") coordinator.fact(call, { kind: "cancellation" });
  saved.end(call, outcome);
  const isError = outcome !== "success";
  coordinator.result(call, published, { outcome: isError ? "failure" : "success", durationMs });
  if (input.final === false) return call;
  saved.finish(call, published, isError ? "failure" : "success");
  history.appendMessage({
    role: "toolResult",
    toolCallId: id,
    toolName: name,
    content: published.content,
    ...(input.details === undefined ? {} : { details: input.details }),
    ...(durationMs === undefined ? {} : { durationMs }),
    isError,
    timestamp: 1
  });

  return call;
}

/** Rebuild calls from Pi's entries, as reconstruction does after a reload. */
function replay(history: SessionManager): Fixture {
  const replayed = fixture(history);
  const { coordinator, saved } = replayed;

  for (const entry of history.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;

    if (message.role === "assistant")
      for (const [index, content] of message.content.entries()) {
        if (content.type !== "toolCall") continue;
        const call = coordinator.add({
          reference: {
            messageTimestamp: message.timestamp,
            contentIndex: index,
            toolCallId: content.id,
            messageEntryId: entry.id
          },
          name: content.name,
          args: content.arguments,
          adapter: nativeAdapter(content.name)!,
          origin: "historical"
        });
        // Replay starts before any result, which a call interrupted by shutdown lacks.
        saved.replay(call);
      }

    if (message.role === "toolResult") {
      const call = coordinator.byId(message.toolCallId)!;
      coordinator.result(
        call,
        { content: message.content, details: message.details },
        { outcome: message.isError ? "failure" : "success", durationMs: message.durationMs }
      );
      saved.replay(call);
    }
  }

  return replayed;
}

function custom(history: SessionManager, type: string): unknown[] {
  return history
    .getBranch()
    .flatMap((entry) => (entry.type === "custom" && entry.customType === type ? [entry.data] : []));
}

function assistantEntry(history: SessionManager, id: string): string {
  const entry = history
    .getBranch()
    .find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "assistant" &&
        entry.message.content.some((content) => content.type === "toolCall" && content.id === id)
    );
  if (!entry) throw new Error(`No assistant entry for ${id}`);

  return entry.id;
}

it.each([
  {
    case: "success",
    facts: [operation({ outcome: "success", exitCode: 0 })],
    outcome: "success",
    saved: { operation: true }
  },
  {
    case: "a nonzero exit code",
    facts: [operation({ outcome: "failure", exitCode: 2 })],
    outcome: "failure",
    saved: { operation: true, exitCode: 2 }
  },
  {
    case: "a timeout",
    facts: [operation({ outcome: "failure", timedOut: true })],
    outcome: "failure",
    saved: { operation: true, timedOut: true }
  },
  {
    case: "a process without an exit code",
    facts: [operation({ outcome: "unavailable", exitCode: null })],
    outcome: "failure",
    saved: { operation: true, exitCode: null }
  },
  {
    case: "an operation failure that Pi reported as success",
    facts: [operation({ outcome: "failure" })],
    outcome: "success",
    saved: { operation: true, outcome: "failure" }
  },
  {
    case: "an operation cancellation",
    facts: [operation({ outcome: "cancelled" })],
    outcome: "failure",
    saved: { cancelled: true, operation: true }
  },
  {
    case: "a host cancellation after an operation failure without an exit code",
    facts: [operation({ outcome: "failure" })],
    outcome: "cancelled",
    saved: { cancelled: true, operation: true, outcome: "failure" }
  },
  {
    case: "a host cancellation before the tool ran",
    facts: [],
    outcome: "cancelled",
    saved: { cancelled: true },
    durationMs: undefined
  },
  {
    case: "an edit that failed before writing",
    name: "edit",
    facts: [],
    outcome: "failure",
    saved: undefined
  },
  {
    case: "a shell success whose final result has no duration",
    facts: [operation({ outcome: "success", exitCode: 0 })],
    outcome: "success",
    saved: { operation: true },
    durationMs: undefined
  },
  {
    case: "a write applied although Pi reported failure",
    name: "write",
    facts: [
      { kind: "change", change: "unavailable", reason: "binary" },
      operation({ outcome: "success" })
    ],
    outcome: "failure",
    saved: {
      operation: true,
      applied: true,
      change: { kind: "unavailable", reason: "binary" }
    }
  },
  {
    case: "disposal after a shell success, before Pi's result",
    facts: [operation({ outcome: "success", exitCode: 0 })],
    outcome: "success",
    final: false,
    saved: { operation: true, exitCode: 0 }
  },
  {
    case: "disposal after an applied write, before Pi's result",
    name: "write",
    facts: [
      { kind: "change", change: "unavailable", reason: "binary" },
      operation({ outcome: "success" })
    ],
    outcome: "success",
    final: false,
    saved: {
      operation: true,
      applied: true,
      change: { kind: "unavailable", reason: "binary" }
    }
  }
] as const)(
  "saves only facts that Pi's entries lack, and replay shows the live card: $case",
  ({ name = "bash", facts, outcome, final, saved, ...input }) => {
    const history = SessionManager.inMemory("/tmp");
    const live = fixture(history, { append: history.appendCustomEntry.bind(history) });
    const args = name === "bash" ? { command: "run" } : { path: "a.bin", content: "x" };
    const durationMs = "durationMs" in input ? input.durationMs : 5;
    const observed = runLive(live, history, {
      id: "call",
      name,
      args,
      facts,
      outcome,
      final,
      durationMs
    });
    const shown = (call: DisplayCall) => ({
      operation: call.operation,
      change: call.change,
      cancelled: isCancelled(call)
    });
    const expected = shown(observed);
    live.dispose();

    const entry = assistantEntry(history, "call");
    expect(custom(history, CALL_TYPE)).toEqual(
      saved ? [{ entry, toolCallId: "call", ...saved }] : []
    );
    const restored = replay(history);

    try {
      const call = restored.coordinator.byId("call")!;
      expect(shown(call)).toEqual(expected);
      expect(call.durationMs).toBe(final === false ? undefined : durationMs);
    } finally {
      restored.dispose();
    }
  }
);

const creationHeaders = "--- /tmp/new.ts\n+++ /tmp/new.ts\n";

it.each([
  {
    case: "content reproduces the observed patch",
    observed: `${creationHeaders}@@ -0,0 +1,1 @@\n+line\n`,
    saved: { kind: "creation" }
  },
  {
    case: "the file holds other bytes",
    observed: "@@ -0,0 +1,1 @@\n+other\n",
    saved: { kind: "creation", patch: "@@ -0,0 +1,1 @@\n+other\n" }
  }
] as const)(
  "saves a write creation patch only when content cannot reproduce it, and replays the observed diff: $case",
  ({ observed, saved }) => {
    const history = SessionManager.inMemory("/tmp");
    const live = fixture(history, { append: history.appendCustomEntry.bind(history) });
    runLive(live, history, {
      id: "write",
      name: "write",
      args: { path: "new.ts", content: "line\n" },
      facts: [{ kind: "change", change: "creation", patch: observed }],
      outcome: "success"
    });
    live.dispose();
    const entry = assistantEntry(history, "write");
    expect(custom(history, CALL_TYPE)).toEqual([{ entry, toolCallId: "write", change: saved }]);
    const restored = replay(history);

    try {
      const change = restored.coordinator.byId("write")?.change;
      expect(change).toMatchObject({ kind: "change", change: "creation" });
      expect(parseRetainedPatch(change?.change === "creation" ? change.patch : "")?.hunks).toEqual(
        parseRetainedPatch(observed)?.hunks
      );
    } finally {
      restored.dispose();
    }
  }
);

const piPatch = "--- a.ts\n+++ a.ts\n@@ -1,1 +1,1 @@\n-before\n+after\n";

it.each([
  { case: "a successful edit with the same patch", outcome: "success", persisted: false },
  { case: "an error result", outcome: "failure", persisted: true },
  { case: "a result without details.patch", outcome: "success", details: {}, persisted: true },
  {
    case: "a result with invalid details.patch",
    outcome: "success",
    details: { patch: "not a unified patch" },
    persisted: true
  },
  {
    case: "different hunks",
    outcome: "success",
    observed: "@@ -1,1 +1,1 @@\n-before\n+other\n",
    persisted: true
  },
  {
    case: "a CRLF file with the same change",
    outcome: "success",
    observed: "--- /work/a.ts\r\n+++ /work/a.ts\r\n@@ -1,1 +1,1 @@\r\n-before\r\n+after\r\n",
    persisted: false
  },
  {
    case: "a BOM file with the same change",
    outcome: "success",
    observed: "@@ -1,1 +1,1 @@\n-\uFEFFbefore\n+\uFEFFafter\n",
    persisted: false
  },
  { case: "disposal before the result", outcome: undefined, persisted: true }
] as const)(
  "persists the observed edit change only when the result cannot replace it: $case",
  ({ outcome, observed = piPatch, persisted, ...input }) => {
    const history = SessionManager.inMemory("/tmp");
    const append = vi.fn();
    const live = fixture(history, { append });
    const fact = { kind: "change", change: "modification", patch: observed } as const;

    try {
      runLive(live, history, {
        id: "edit",
        name: "edit",
        args: {},
        facts: [fact],
        outcome,
        details: "details" in input ? input.details : { patch: piPatch }
      });
    } finally {
      live.dispose();
    }

    const entry = assistantEntry(history, "edit");
    expect(append.mock.calls.filter(([type]) => type === CALL_TYPE)).toEqual(
      persisted
        ? [
            [
              CALL_TYPE,
              {
                entry,
                toolCallId: "edit",
                change: { kind: "modification", patch: observed }
              }
            ]
          ]
        : []
    );
  }
);

it.each([
  {
    case: "the session write fails",
    name: "bash",
    args: { command: "run" },
    fact: operation({ outcome: "failure", exitCode: 2 }),
    outcome: "failure",
    writeFails: true,
    warning: "call record not saved: the session write failed."
  },
  {
    case: "the record exceeds the size limit",
    name: "write",
    args: { path: "new.ts", content: "x" },
    fact: {
      kind: "change",
      change: "creation",
      // Within the patch limit, but JSON escapes each quote past the record limit.
      patch: `@@ -0,0 +1,1 @@\n+${'"'.repeat(100_000)}\n`
    },
    outcome: "success",
    writeFails: false,
    warning: "call record not saved: it exceeds 160 KiB or fails validation."
  }
] as const)(
  "warns once when a call entry cannot be saved, keeping the live facts: $case",
  ({ name, args, fact, outcome, writeFails, warning }) => {
    const history = SessionManager.inMemory("/tmp");
    const warn = vi.fn();
    const append = vi.fn(() => {
      if (writeFails) throw new Error("disk full");
    });
    const live = fixture(history, { append, warn });

    try {
      for (const id of ["first", "second"]) {
        const call = runLive(live, history, { id, name, args, facts: [fact], outcome });
        expect(call[fact.kind]).toEqual(fact);
      }
    } finally {
      live.dispose();
    }

    expect(append).toHaveBeenCalledTimes(writeFails ? 2 : 0);
    expect(warn).toHaveBeenCalledExactlyOnceWith(warning);
  }
);
