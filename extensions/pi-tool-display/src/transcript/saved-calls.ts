import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type {
  ChangeFact,
  DisplayCall,
  DisplayFact,
  LocalDetails,
  OperationFact,
  Outcome
} from "../contracts.ts";
import { creationPatch, parseRetainedPatch, sameRetainedHunks } from "../diff.ts";
import { record } from "../values.ts";
import type { TranscriptCoordinator } from "./coordinator.ts";
import type { DisplayHistory } from "./history.ts";
import { CALL_TYPE, parseCallRecord, WRITER_TYPE, type CallRecord } from "./metadata.ts";
import { localKey, type LocalCall, type LocalRead, type LocalStore } from "./store.ts";

/** Native calls whose operations are observed, with timing kept on this machine. */
const OBSERVED_ADAPTERS = new Set(["pi:bash", "pi:powershell", "pi:edit", "pi:write"]);

/** Facts observed during one live call, saved once when it ends. */
type ObservedCall = { operation?: OperationFact; change?: ChangeFact; savedOutput?: string };

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
  "cancelled" | "outcome" | "exitCode" | "timedOut" | "applied"
>;

/**
 * The operation that replay shows for saved facts and Pi's error flag. The writer
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

  if (operation) addOperationFacts(call.adapter.family, operation, published, facts);

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

/**
 * Rebuild an observed operation from saved facts and Pi's published outcome. Without
 * local timing or a saved operation fact there is no evidence of an observed operation.
 */
function replayedOperation(
  call: DisplayCall,
  recorded: CallRecord | undefined,
  local: LocalCall | undefined
): OperationFact | undefined {
  const durationMs = local?.durationMs;
  if (
    durationMs === undefined &&
    recorded?.outcome !== "failure" &&
    recorded?.exitCode === undefined &&
    !recorded?.timedOut &&
    !recorded?.applied &&
    !recorded?.change
  )
    return undefined;

  return {
    kind: "operation",
    ...derivedOperation(call.adapter.family, call.outcome, recorded ?? {}),
    ...(durationMs === undefined ? {} : { durationMs })
  };
}

export type SavedCallsOptions = {
  /** The directory of this session; a replayed call from another directory keeps its own. */
  cwd: string;
  coordinator: TranscriptCoordinator;
  history: DisplayHistory;
  /** Without it, calls save only local details. */
  append?: ExtensionAPI["appendEntry"] | undefined;
  /** This writer's machine-local details; it outlives transcript reconstruction. */
  local: Pick<LocalStore, "writer" | "open" | "call" | "diagnostic" | "read">;
};

/**
 * The round trip of saved calls. A live call keeps its observed facts until Pi's
 * final result, then saves only what Pi's entries lack: a local line on this
 * machine and at most one call entry. Replay applies the same facts to a
 * historical call, so it shows the card that the live call showed.
 */
export class SavedCalls {
  /** Observed facts wait for the end of the call, so each call writes at most one entry. */
  private observed = new Map<DisplayCall, ObservedCall>();
  /** Pi's end-event outcome, kept until Pi's final result message; only it shows host cancellation. */
  private ended = new Map<DisplayCall, Outcome>();
  /** Historical calls waiting for one writer's local file. */
  private localReads = new Map<string, DisplayCall[]>();
  private disposed = false;

  constructor(private options: SavedCallsOptions) {}

  /** Pi queued a live call; name this writer on the branch before its result. */
  queued(call: DisplayCall): void {
    if (this.disposed || call.origin !== "live") return;
    this.sourceEntry(call);
    this.appendWriter();
  }

  /** Native observation of a live call started; only observed calls save operations. */
  observe(call: DisplayCall): void {
    if (this.disposed || call.origin !== "live") return;
    this.sourceEntry(call);
    this.observed.set(call, this.observed.get(call) ?? {});
  }

  /** Show an observed fact on the live card and keep it for the call's saved facts. */
  fact(call: DisplayCall, fact: DisplayFact): void {
    if (this.disposed) return;
    this.options.coordinator.fact(call, fact);
    const observed = this.observed.get(call);
    if (!observed) return;
    if (fact.kind === "operation") observed.operation = fact;
    if (fact.kind === "change") observed.change = fact;
    if (fact.kind === "saved-output") observed.savedOutput = fact.path;
  }

  /** Pi's end event. Extensions can still replace the result before Pi saves it. */
  end(call: DisplayCall, outcome: Outcome): void {
    if (!this.disposed && call.origin === "live") this.ended.set(call, outcome);
  }

  /**
   * Pi's final result message. Write the local line, then at most one call entry;
   * Pi appends the result after both. When disposal comes first, even after the end
   * event, no published outcome is known.
   */
  finish(call: DisplayCall, result?: AgentToolResult<unknown>, published?: Outcome): void {
    if (this.disposed || call.origin !== "live") return;
    const observed = this.observed.get(call);
    const ended = this.ended.get(call);
    this.observed.delete(call);
    this.ended.delete(call);
    const entry = this.sourceEntry(call);
    if (!entry) return;
    const { toolCallId } = call.reference;
    const { append, local } = this.options;
    this.appendWriter();
    if (OBSERVED_ADAPTERS.has(call.adapter.id))
      local.call({
        entry,
        toolCallId,
        tool: call.name,
        ...(observed?.operation?.durationMs === undefined
          ? {}
          : { durationMs: observed.operation.durationMs }),
        ...(observed?.savedOutput ? { savedOutput: observed.savedOutput } : {}),
        ...(observed ? {} : { reason: "not-observed" as const })
      });
    const facts =
      append &&
      recordedFacts(call, observed, result, published, (ended ?? published) === "cancelled");
    if (!facts) return;
    const value = { entry, toolCallId, ...facts };
    if (parseCallRecord(value)) this.appendRecord(CALL_TYPE, value, { entry, toolCallId });
    else
      local.diagnostic({
        code: "session-record-rejected",
        entry,
        toolCallId,
        detail: "record exceeds 160 KiB or fails validation"
      });
  }

  /** Restore saved facts even without a result; local details follow asynchronously. */
  replay(call: DisplayCall): void {
    if (this.disposed || call.origin !== "historical") return;
    const { coordinator, history, local } = this.options;
    const { messageEntryId: entry, toolCallId } = call.reference;
    if (!entry) return;
    const recorded = history.callRecord(entry, toolCallId);
    if (recorded?.cancelled) coordinator.fact(call, { kind: "cancellation" });
    const source = history.writerFor(entry, toolCallId);
    // Resolve copied targets against the directory where the call ran.
    if (source && source.cwd !== this.options.cwd) coordinator.setCwd(call, source.cwd);
    if (!OBSERVED_ADAPTERS.has(call.adapter.id)) return;
    const change = replayedChange(call, recorded?.change);
    if (change) coordinator.fact(call, change);
    const writer = source?.writer;
    if (!writer) return this.applyLocal(call, "not-observed");
    this.applyLocal(call, "pending");
    const waiting = this.localReads.get(writer);

    if (waiting) {
      if (!waiting.includes(call)) waiting.push(call);

      return;
    }

    const calls = [call];
    this.localReads.set(writer, calls);
    void local.read(writer).then(
      (read) => {
        if (this.disposed) return;
        this.localReads.delete(writer);
        coordinator.batch(() => {
          for (const call of calls) this.applyRead(call, read);
        });
      },
      () => {}
    );
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
  private appendRecord(type: string, data: object, call?: { entry: string; toolCallId: string }) {
    try {
      this.options.append?.(type, data);
    } catch {
      this.options.local.diagnostic({ code: "session-write-failed", ...call, detail: type });
    }
  }

  /** Name this writer's local file on the current branch before the first result it writes. */
  private appendWriter(): void {
    const { append, local, cwd, history } = this.options;
    if (!append) return;
    local.open();
    if (!history.hasWriter(local.writer))
      this.appendRecord(WRITER_TYPE, { writer: local.writer, cwd });
  }

  private applyRead(call: DisplayCall, read: LocalRead): void {
    const entry = call.reference.messageEntryId;
    if (!entry) return;
    if (read.status !== "found") return this.applyLocal(call, read.status);
    const line = read.calls.get(localKey(entry, call.reference.toolCallId));
    if (!line) return this.applyLocal(call, "unsaved");
    this.applyLocal(call, line.reason ?? "found", line);
  }

  private applyLocal(call: DisplayCall, state: LocalDetails, line?: LocalCall): void {
    const { coordinator, history } = this.options;
    const entry = call.reference.messageEntryId;
    const recorded = entry ? history.callRecord(entry, call.reference.toolCallId) : undefined;
    const operation = replayedOperation(call, recorded, line);
    if (operation) coordinator.fact(call, operation);
    coordinator.setLocal(call, state);

    if (line?.savedOutput && call.adapter.savedOutput && !call.savedPath)
      coordinator.setSavedPath(call, line.savedOutput);
  }
}
