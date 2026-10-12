import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxToolCall, type JsonObject, type JsonValue } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

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
import { CALL_TYPE, WRITER_TYPE } from "./metadata.ts";
import { SavedCalls, type SavedCallsOptions } from "./saved-calls.ts";
import { LocalStore } from "./store.ts";

let root: string;
const stores: LocalStore[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-tool-display-saved-calls-"));
});

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  await rm(root, { recursive: true, force: true });
});

/** A writer whose file is under the fixture root, never the real agent directory. */
function localStore(): LocalStore {
  const store = new LocalStore({
    root,
    persisted: true,
    header: { sessionId: "session", sessionFile: undefined, cwd: "/tmp", pi: "test" },
    warn() {}
  });
  stores.push(store);

  return store;
}

type Fixture = { coordinator: TranscriptCoordinator; saved: SavedCalls; dispose(): void };

function fixture(
  history: SessionManager,
  options: Partial<Pick<SavedCallsOptions, "append" | "local">> = {}
): Fixture {
  const coordinator = new TranscriptCoordinator("saved-calls", { cwd: "/tmp" });
  const saved = new SavedCalls({
    cwd: "/tmp",
    coordinator,
    history: new DisplayHistory(history),
    append: options.append,
    local: options.local ?? localStore()
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
};

/**
 * Pi's order: the assistant entry, the start event, observation, the end event, the
 * result message, and then its entry. An undefined outcome stops before the end event.
 */
function runLive({ coordinator, saved }: Fixture, history: SessionManager, input: LiveCall) {
  const { id, name, args, outcome } = input;
  const published = {
    content: [{ type: "text" as const, text: "published body" }],
    details: input.details
  };
  history.appendMessage(assistantMessage([fauxToolCall(name, args, { id })], 1));
  const call = coordinator.add(
    { messageTimestamp: 1, contentIndex: 0, toolCallId: id },
    name,
    args,
    nativeAdapter(name)!,
    "live"
  );
  saved.queued(call);
  saved.observe(call);
  for (const fact of input.facts) saved.fact(call, fact);
  if (!outcome) return call;

  // The end event shows a host cancellation on the live card.
  if (outcome === "cancelled") coordinator.fact(call, { kind: "cancellation" });
  saved.end(call, outcome);
  const isError = outcome !== "success";
  coordinator.result(call, published, isError ? "failure" : "success");
  if (input.final === false) return call;
  saved.finish(call, published, isError ? "failure" : "success");
  history.appendMessage({
    role: "toolResult",
    toolCallId: id,
    toolName: name,
    content: published.content,
    ...(input.details === undefined ? {} : { details: input.details }),
    isError,
    timestamp: 1
  });

  return call;
}

/** Rebuild calls from Pi's entries, as reconstruction does after a reload. */
function replay(history: SessionManager, local?: LocalStore): Fixture {
  const replayed = fixture(history, local ? { local } : {});
  const { coordinator, saved } = replayed;

  for (const entry of history.getBranch()) {
    if (entry.type !== "message") continue;
    const message = entry.message;

    if (message.role === "assistant")
      for (const [index, content] of message.content.entries()) {
        if (content.type !== "toolCall") continue;
        const call = coordinator.add(
          {
            messageTimestamp: message.timestamp,
            contentIndex: index,
            toolCallId: content.id,
            messageEntryId: entry.id
          },
          content.name,
          content.arguments,
          nativeAdapter(content.name)!,
          "historical"
        );
        // Replay starts before any result, which a call interrupted by shutdown lacks.
        saved.replay(call);
      }

    if (message.role === "toolResult") {
      const call = coordinator.byId(message.toolCallId)!;
      coordinator.result(
        call,
        { content: message.content, details: message.details },
        message.isError ? "failure" : "success"
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
    facts: [operation({ durationMs: 5, outcome: "success", exitCode: 0 })],
    outcome: "success",
    saved: undefined
  },
  {
    case: "a nonzero exit code",
    facts: [operation({ durationMs: 5, outcome: "failure", exitCode: 2 })],
    outcome: "failure",
    saved: { exitCode: 2 }
  },
  {
    case: "a timeout",
    facts: [operation({ durationMs: 5, outcome: "failure", timedOut: true })],
    outcome: "failure",
    saved: { timedOut: true }
  },
  {
    case: "a process without an exit code",
    facts: [operation({ durationMs: 5, outcome: "unavailable", exitCode: null })],
    outcome: "failure",
    saved: { exitCode: null }
  },
  {
    case: "an operation failure that Pi reported as success",
    facts: [operation({ durationMs: 5, outcome: "failure" })],
    outcome: "success",
    saved: { outcome: "failure" }
  },
  {
    case: "an operation cancellation",
    facts: [operation({ durationMs: 5, outcome: "cancelled" })],
    outcome: "failure",
    saved: { cancelled: true }
  },
  {
    case: "a host cancellation after an operation failure without an exit code",
    facts: [operation({ durationMs: 5, outcome: "failure" })],
    outcome: "cancelled",
    saved: { cancelled: true, outcome: "failure" }
  },
  {
    case: "a host cancellation before the operation",
    facts: [],
    outcome: "cancelled",
    saved: { cancelled: true },
    local: {}
  },
  {
    case: "a write applied although Pi reported failure",
    name: "write",
    facts: [
      { kind: "change", change: "unavailable", reason: "binary" },
      operation({ durationMs: 5, outcome: "success" })
    ],
    outcome: "failure",
    saved: { applied: true, change: { kind: "unavailable", reason: "binary" } }
  },
  {
    case: "disposal after a shell success, before Pi's result",
    facts: [operation({ durationMs: 5, outcome: "success", exitCode: 0 })],
    outcome: "success",
    final: false,
    saved: { exitCode: 0 }
  },
  {
    case: "disposal after an applied write, before Pi's result",
    name: "write",
    facts: [
      { kind: "change", change: "unavailable", reason: "binary" },
      operation({ durationMs: 5, outcome: "success" })
    ],
    outcome: "success",
    final: false,
    saved: { applied: true, change: { kind: "unavailable", reason: "binary" } }
  }
] as const)(
  "saves only facts that Pi's entries lack, and replay shows the live card: $case",
  async ({ name = "bash", facts, outcome, final, saved, ...input }) => {
    const history = SessionManager.inMemory("/tmp");
    const writer = localStore();
    const live = fixture(history, {
      append: history.appendCustomEntry.bind(history),
      local: writer
    });
    const args = name === "bash" ? { command: "run" } : { path: "a.bin", content: "x" };
    const observed = runLive(live, history, { id: "call", name, args, facts, outcome, final });
    const shown = (call: DisplayCall) => ({
      operation: call.operation,
      change: call.change,
      cancelled: isCancelled(call)
    });
    const expected = shown(observed);
    live.dispose();
    await writer.dispose();

    const entry = assistantEntry(history, "call");
    expect(custom(history, WRITER_TYPE)).toEqual([{ writer: writer.writer, cwd: "/tmp" }]);
    expect(custom(history, CALL_TYPE)).toEqual(
      saved ? [{ entry, toolCallId: "call", ...saved }] : []
    );
    const file = await readFile(
      join(root, "pi-tool-display", "calls", `${writer.writer}.jsonl`),
      "utf8"
    );
    expect(file).not.toContain("published body");
    expect(
      file
        .trimEnd()
        .split("\n")
        .slice(1)
        .map((line) => JSON.parse(line) as unknown)
    ).toEqual([
      {
        type: "call",
        entry,
        toolCallId: "call",
        tool: name,
        ...("local" in input ? input.local : { durationMs: 5 })
      }
    ]);

    const reader = localStore();
    const restored = replay(history, reader);

    try {
      const call = restored.coordinator.byId("call")!;
      await reader.read(writer.writer);
      expect(call.local).toBe("found");
      expect(shown(call)).toEqual(expected);
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
