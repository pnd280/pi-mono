import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { ChangeFact, DisplayCall, DisplayFact, OperationFact, Outcome } from "../contracts.ts";
import { creationPatch, parseRetainedPatch, sameRetainedHunks } from "../diff.ts";
import { record } from "../values.ts";
import type { TranscriptCoordinator } from "./coordinator.ts";
import { callKey, type DisplayHistory } from "./history.ts";
import { CALL_TYPE, parseCallRecord, type CallRecord } from "./metadata.ts";

/** Native calls whose operations are observed. */
const OBSERVED_ADAPTERS = new Set(["pi:bash", "pi:powershell", "pi:edit", "pi:write"]);

/** Facts observed during one live call, saved once when it ends. */
type ObservedCall = { operation?: OperationFact; change?: ChangeFact };

type RecordedChange = CallRecord["change"];

function contentArgument(args: unknown): string | undefined {
  const content = record(args).content;

  return typeof content === "string" ? content : undefined;
}

/** Save a change only when replay cannot produce the same change from Pi's entries. */
function recordedChange(
  call: DisplayCall,
  change: ChangeFact | undefined,
  result: AgentToolResult<unknown> | undefined,
  outcome: Outcome | undefined
): RecordedChange {
  if (!change) return undefined;
  const supplied = outcome === "success" ? record(result?.details).patch : undefined;

  if (call.adapter.family === "edit" && typeof supplied === "string") {
    const replaced =
      change.change === "unavailable"
        ? parseRetainedPatch(supplied) !== undefined
        : sameRetainedHunks(supplied, change.patch);
    if (replaced) return undefined;
  }

  if (change.change === "unavailable") return { kind: "unavailable", reason: change.reason };
  const content = contentArgument(call.args);
  if (
    call.adapter.family === "write" &&
    change.change === "creation" &&
    content !== undefined &&
    sameRetainedHunks(creationPatch(content), change.patch)
  )
    return { kind: "creation" };

  return { kind: change.change, patch: change.patch };
}

type OperationRecord = Pick<
  CallRecord,
  "cancelled" | "operation" | "outcome" | "exitCode" | "timedOut" | "applied"
>;

/**
 * The operation that replay shows for saved facts and Pi's error flag. A live call
 * saves only the fields this cannot derive, so live and replayed operations match.
 */
function derivedOperation(
  family: DisplayCall["adapter"]["family"],
  published: Outcome,
  recorded: OperationRecord
): Pick<OperationFact, "outcome" | "exitCode" | "timedOut"> {
  const { exitCode, timedOut } = recorded;
  let outcome: Outcome =
    recorded.outcome !== "failure" && (published === "success" || recorded.applied)
      ? "success"
      : "failure";

  if (family === "shell") {
    if (exitCode === null) outcome = "unavailable";
    else if (exitCode !== undefined) outcome = exitCode === 0 ? "success" : "failure";
    else if (timedOut) outcome = "failure";
    else if (recorded.cancelled && recorded.outcome !== "failure") outcome = "cancelled";
  }

  // null records a process without an exit code; only undefined falls back.
  let code = exitCode;
  if (code === undefined && family === "shell" && outcome === "success") code = 0;

  return {
    outcome,
    ...(code === undefined ? {} : { exitCode: code }),
    ...(timedOut ? { timedOut } : {})
  };
}

/**
 * Add the operation fields that replay would otherwise derive differently. Without
 * Pi's final result, replay can see any published outcome, so the fields must hold
 * for each of them.
 */
function addOperationFacts(
  family: DisplayCall["adapter"]["family"],
  operation: OperationFact,
  published: Outcome | undefined,
  facts: OperationRecord
): void {
  // Derivation distinguishes only a successful published outcome from the others.
  const outcomes: readonly Outcome[] = published ? [published] : ["success", "failure"];
  const differs = (field: "outcome" | "exitCode", value: unknown) =>
    outcomes.some((outcome) => derivedOperation(family, outcome, facts)[field] !== value);
  const { exitCode } = operation;
  if (exitCode !== undefined && differs("exitCode", exitCode)) facts.exitCode = exitCode;
  if (
    (family === "edit" || family === "write") &&
    operation.outcome === "success" &&
    differs("outcome", "success")
  )
    facts.applied = true;
  if (!facts.outcome && operation.outcome === "failure" && differs("outcome", "failure"))
    facts.outcome = "failure";
}

/** Facts that Pi's own entries do not hold; undefined when there are none. */
function recordedFacts(
  call: DisplayCall,
  observed: ObservedCall | undefined,
  result: AgentToolResult<unknown> | undefined,
  published: Outcome | undefined,
  cancelled: boolean
): Omit<CallRecord, "entry" | "toolCallId"> | undefined {
  const operation = observed?.operation;
  const change = recordedChange(call, observed?.change, result, published);
  const facts: OperationRecord = {
    // Live cards treat either cancellation as a cancelled call, for every adapter.
    ...(cancelled || operation?.outcome === "cancelled" ? { cancelled: true as const } : {}),
    ...(operation?.timedOut ? { timedOut: true as const } : {})
  };

  if (operation) {
    facts.operation = true;
    addOperationFacts(call.adapter.family, operation, published, facts);
  }

  const record = { ...facts, ...(change ? { change } : {}) };

  return Object.keys(record).length ? record : undefined;
}

function replayedChange(call: DisplayCall, change: RecordedChange): ChangeFact | undefined {
  if (!change) return undefined;
  if (change.kind === "unavailable")
    return { kind: "change", change: "unavailable", reason: change.reason };
  const content = contentArgument(call.args);
  const patch = change.patch ?? (content === undefined ? undefined : creationPatch(content));

  return patch === undefined ? undefined : { kind: "change", change: change.kind, patch };
}

/** Rebuild an observed operation from saved facts and Pi's published outcome. */
function replayedOperation(
  call: DisplayCall,
  recorded: CallRecord | undefined
): OperationFact | undefined {
  if (!recorded?.operation) return undefined;

  return { kind: "operation", ...derivedOperation(call.adapter.family, call.outcome, recorded) };
}

export type SavedCallsOptions = {
  coordinator: TranscriptCoordinator;
  history: DisplayHistory;
  /** Without it, calls save nothing. */
  append?: ExtensionAPI["appendEntry"] | undefined;
  /** Reports a call entry that was not saved; the live card keeps its facts. */
  warn(message: string): void;
  /**
   * Observed saved-output paths by call. They are never saved: the owner keeps them
   * across transcript reconstruction, because Pi's thrown errors hold no path.
   */
  savedPaths?: Map<string, string> | undefined;
};

/**
 * The round trip of saved calls. A live call keeps its observed facts until Pi's
 * final result, then saves at most one call entry with what Pi's entries lack.
 * Replay combines the recorded facts with Pi's saved results. Observed saved-output
 * paths stay in memory.
 */
export class SavedCalls {
  /** Observed facts wait for the end of the call, so each call writes at most one entry. */
  private observed = new Map<DisplayCall, ObservedCall>();
  /** Pi's end-event outcome, kept until Pi's final result message; only it shows host cancellation. */
  private ended = new Map<DisplayCall, Outcome>();
  /** Warnings already reported. */
  private warned = new Set<string>();
  private disposed = false;

  constructor(private options: SavedCallsOptions) {}

  /** Native observation of a live call started; only observed calls save operations. */
  observe(call: DisplayCall): void {
    if (this.disposed || call.origin !== "live") return;
    this.sourceEntry(call);
    this.observed.set(call, this.observed.get(call) ?? {});
  }

  /** Apply a fact to the live card; keep operation and change facts for the call entry. */
  fact(call: DisplayCall, fact: DisplayFact): void {
    if (this.disposed) return;
    this.options.coordinator.fact(call, fact);
    const observed = this.observed.get(call);
    if (!observed) return;
    if (fact.kind === "operation") observed.operation = fact;
    if (fact.kind === "change") observed.change = fact;
  }

  /** Pi's end event. Extensions can still replace the result before Pi saves it. */
  end(call: DisplayCall, outcome: Outcome): void {
    if (!this.disposed && call.origin === "live") this.ended.set(call, outcome);
  }

  /**
   * Pi's final result message. Write at most one call entry; Pi appends the result
   * after it. When disposal comes first, even after the end event, no published
   * outcome is known.
   */
  finish(call: DisplayCall, result?: AgentToolResult<unknown>, published?: Outcome): void {
    if (this.disposed || call.origin !== "live") return;
    const observed = this.observed.get(call);
    const ended = this.ended.get(call);
    this.observed.delete(call);
    this.ended.delete(call);
    const entry = this.sourceEntry(call);
    if (!entry) return;
    if (call.savedPath)
      this.options.savedPaths?.set(callKey(entry, call.reference.toolCallId), call.savedPath);
    const { append } = this.options;
    const facts =
      append &&
      recordedFacts(call, observed, result, published, (ended ?? published) === "cancelled");
    if (!facts) return;
    const value = { entry, toolCallId: call.reference.toolCallId, ...facts };
    if (parseCallRecord(value)) this.appendRecord(CALL_TYPE, value);
    else this.warn("call record not saved: it exceeds 160 KiB or fails validation.");
  }

  /** Restore saved facts, again once Pi's result supplies its outcome and duration. */
  replay(call: DisplayCall): void {
    if (this.disposed || call.origin !== "historical") return;
    const { coordinator, history } = this.options;
    const { messageEntryId: entry, toolCallId } = call.reference;
    if (!entry) return;
    const recorded = history.callRecord(entry, toolCallId);
    if (recorded?.cancelled) coordinator.fact(call, { kind: "cancellation" });
    if (!OBSERVED_ADAPTERS.has(call.adapter.id)) return;
    const path = this.options.savedPaths?.get(callKey(entry, toolCallId));
    if (path) coordinator.fact(call, { kind: "saved-output", path });
    const change = replayedChange(call, recorded?.change);
    if (change) coordinator.fact(call, change);
    const operation = replayedOperation(call, recorded);
    if (operation) coordinator.fact(call, operation);
  }

  /** Save the facts of calls still running; they keep the facts known so far. */
  dispose(): void {
    if (this.disposed) return;
    for (const call of new Set([...this.observed.keys(), ...this.ended.keys()])) this.finish(call);
    this.disposed = true;
  }

  /** The assistant entry is appended before tools run; resolve it again at the end. */
  private sourceEntry(call: DisplayCall): string | undefined {
    const { messageTimestamp, contentIndex, toolCallId } = call.reference;
    const source = this.options.history.messageEntry(messageTimestamp, contentIndex, toolCallId);
    if (source) this.options.coordinator.setReferenceEntry(call, source);

    return source;
  }

  /** Best effort: persistence must never change the delegated result. */
  private appendRecord(type: string, data: object) {
    try {
      this.options.append?.(type, data);
    } catch {
      this.warn("call record not saved: the session write failed.");
    }
  }

  /** Each problem warns once, so a failing session cannot flood notifications. */
  private warn(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.options.warn(message);
  }
}
