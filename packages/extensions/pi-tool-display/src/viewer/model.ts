import {
  CURRENT_SESSION_VERSION,
  SessionManager,
  type JsonAgentSessionEvent,
  type SessionEntry,
  type SessionHeader
} from "@earendil-works/pi-coding-agent";

import { genericAdapter } from "../adapters/generic.ts";
import {
  recordedAdapter,
  supportsRecordedCall,
  supportsRecordedSource
} from "../adapters/recorded.ts";
import {
  callKey,
  type CallReference,
  type DisplayMode,
  type SavedOutput,
  type ToolDisplayAdapter
} from "../contracts.ts";
import { loadDisplaySettings } from "../settings.ts";
import { hostToolResult, TranscriptMessages } from "../transcript/messages.ts";
import {
  recordCallKey,
  resultAfter,
  sourceCall,
  TranscriptRecordIndex,
  type RunRecord
} from "../transcript/records.ts";
import { DisplaySession } from "../transcript/session.ts";
import { WireMessages, type TranscriptMessage } from "./wire.ts";

export interface TranscriptSnapshot {
  sessionId: string;
  cwd: string;
  entries: readonly SessionEntry[];
  leafId: string | null;
  /** A stopped checkpoint clears wire state and cannot load mutable saved output. */
  historical?: boolean;
}

const originalUnavailable: ToolDisplayAdapter = {
  ...genericAdapter,
  id: "original-unavailable",
  omitFromSummary: true,
  separateRun: true,
  notices: () => [{ kind: "unavailable", text: "Original renderer unavailable in this viewer." }]
};

const noSavedOutput = async (path: string): Promise<SavedOutput> => ({
  path,
  notice: "Saved output unavailable; showing retained output."
});

/** No writable runtime, registry, extension loader, or filesystem capability is held by this model. */
export class TranscriptModel {
  display: DisplaySession;
  records: TranscriptRecordIndex;
  messages: readonly TranscriptMessage[] = [];
  revision = 0;
  private snapshot: TranscriptSnapshot;
  private manager: SessionManager;
  private wire = new WireMessages();
  private updates = new Map<
    string,
    {
      timestamp: number | undefined;
      settled: boolean;
      event: Extract<
        JsonAgentSessionEvent,
        { type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end" }
      >;
    }
  >();
  private listeners = new Set<() => void>();
  private active = true;
  /** The child agent started and has not settled, so history can still gain calls. */
  private running = false;

  constructor(
    snapshot: TranscriptSnapshot,
    private options: {
      mode?: DisplayMode;
      readSavedOutput?: (path: string) => Promise<SavedOutput>;
    } = {}
  ) {
    this.snapshot = snapshot;
    this.manager = this.session(snapshot);
    this.records = new TranscriptRecordIndex(this.manager.getBranch());
    this.display = this.createDisplay();
    this.rebuild();
  }

  private session(snapshot: TranscriptSnapshot): SessionManager {
    const header: SessionHeader = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: snapshot.sessionId,
      cwd: snapshot.cwd,
      timestamp: new Date(0).toISOString()
    };
    const manager = SessionManager.inMemory(
      snapshot.cwd,
      undefined,
      structuredClone([header, ...snapshot.entries])
    );
    if (snapshot.leafId === null) manager.resetLeaf();
    else manager.branch(snapshot.leafId);

    return manager;
  }

  private adapter(name: string, reference?: CallReference, args?: unknown): ToolDisplayAdapter {
    if (!reference) return genericAdapter;
    const record = this.records.calls.get(recordCallKey(reference));
    if (!record || record.name !== name || record.sessionId !== this.snapshot.sessionId)
      return genericAdapter;
    if (record.selection.kind === "original") return originalUnavailable;
    if (record.selection.kind === "generic" || !record.source) return genericAdapter;
    if (!supportsRecordedSource(record.selection.id, name, record.source)) return genericAdapter;
    const source = sourceCall(this.records.sources, reference, name);
    if (!source || JSON.stringify(source.arguments) !== JSON.stringify(args)) return genericAdapter;
    const adapter = recordedAdapter(record.selection.id, record.selection.version, name);
    if (!adapter || !supportsRecordedCall(adapter, name, args)) return genericAdapter;

    return adapter;
  }

  private createDisplay(): DisplaySession {
    return new DisplaySession({
      runtime: this.snapshot.sessionId,
      cwd: this.snapshot.cwd,
      history: this.manager,
      settings: loadDisplaySettings([]),
      mode: this.options.mode ?? "summary",
      expanded: () => false,
      adapters: () => (name, reference, args) => this.adapter(name, reference, args),
      readSavedOutput: this.snapshot.historical
        ? noSavedOutput
        : (this.options.readSavedOutput ?? noSavedOutput)
    });
  }

  private rebuild(): void {
    const expanded = new Map(
      [...this.display.coordinator.calls.values()].map((call) => [
        recordCallKey(call.reference),
        call.expanded
      ])
    );
    const opened = new Set(
      [...this.display.coordinator.calls.values()]
        .filter((call) => this.display.coordinator.run(call)?.opened)
        .map((call) => call.key)
    );
    const mode = this.display.coordinator.mode;
    this.display.dispose();
    const branch = this.manager.getBranch();
    this.records = new TranscriptRecordIndex(branch);
    this.display = this.createDisplay();
    this.display.coordinator.setMode(mode);
    const projected = this.manager.buildSessionProjection().messages;
    // Saved entries supersede provisional messages even when compaction or a branch move hides them.
    this.wire.reconcile(
      this.snapshot.entries.flatMap((entry) => (entry.type === "message" ? [entry.message] : []))
    );
    this.wire.reconcile(projected);
    this.wire.reconcileCustom(this.snapshot.entries);
    const provisional = [...this.wire.pending.values()];
    this.messages = [...projected, ...provisional];
    const reader = new TranscriptMessages(true);
    this.display.reconstruct(() => {
      for (const message of projected) this.display.message(reader.read(message), "historical");
      for (const message of provisional)
        this.display.message(
          reader.read(message),
          this.wire.isLive(message) ? "live" : "historical",
          false
        );
    });
    const coordinator = this.display.coordinator;

    this.replayExecution(branch);

    for (const boundary of this.records.boundaries) {
      const call = coordinator.calls.get(callKey(this.snapshot.sessionId, boundary.call));
      if (call) coordinator.setBoundary(boundary, call, boundary.boundary);
    }

    if (this.running) coordinator.resume();
    else coordinator.settle();

    for (const call of coordinator.calls.values()) {
      if (call.result && !supportsRecordedCall(call.adapter, call.name, call.args, call.result))
        coordinator.setAdapter(call, genericAdapter);
      coordinator.expand(call, expanded.get(recordCallKey(call.reference)) ?? mode === "verbose");
      if (opened.has(call.key)) coordinator.activate(call, "notice");
    }

    this.revision++;
    for (const listener of this.listeners) listener();
  }

  private replayExecution(branch: readonly SessionEntry[]): void {
    const coordinator = this.display.coordinator;

    for (const [id, observation] of this.updates) {
      const update = observation.event;
      const call = coordinator.byId(update.toolCallId);
      if (
        !call ||
        call.name !== update.toolName ||
        ![undefined, call.reference.messageTimestamp].includes(observation.timestamp)
      )
        continue;
      // Execution can arrive before its source call. Bind once, so a reused ID cannot take it.
      observation.timestamp = call.reference.messageTimestamp;

      // Committed results supersede wire events even when projection removes them.
      if (call.result || resultAfter(call.reference, call.name, branch)) {
        this.updates.delete(id);
        continue;
      }

      if (observation.settled && update.type === "tool_execution_start") continue;
      coordinator.observeExecution(call);
      if (update.type === "tool_execution_start") continue;
      this.display.result(
        update.toolCallId,
        hostToolResult(update.type === "tool_execution_end" ? update.result : update.partialResult),
        update.type === "tool_execution_end" && update.isError ? "failure" : "success",
        update.type === "tool_execution_update"
      );
      if (observation.settled && update.type === "tool_execution_update")
        coordinator.update(call, "unavailable");
    }
  }

  replace(snapshot: TranscriptSnapshot): void {
    if (!this.active) return;
    const manager = this.session(snapshot);
    const ancestry = manager.getBranch();
    const moved =
      snapshot.sessionId !== this.snapshot.sessionId ||
      (this.snapshot.leafId !== null &&
        !ancestry.some((entry) => entry.id === this.snapshot.leafId));

    if (moved || snapshot.historical) {
      this.running = false;
      this.wire.clear();
      this.updates.clear();
    }

    this.snapshot = snapshot;
    this.manager = manager;
    this.rebuild();
  }

  event(event: JsonAgentSessionEvent): void {
    if (!this.active || ("parentToolCallId" in event && event.parentToolCallId)) return;
    if (event.type === "entry_appended") return; // The source refresh supplies its authoritative branch and leaf.
    if (event.type === "agent_start") this.running = true;

    if (
      event.type === "message_start" ||
      event.type === "message_update" ||
      event.type === "message_end"
    ) {
      this.running = true;
      this.wire.event(event);
      this.rebuild();
    } else if (
      event.type === "tool_execution_start" ||
      event.type === "tool_execution_update" ||
      event.type === "tool_execution_end"
    ) {
      this.running = true;
      this.updates.set(event.toolCallId, {
        event,
        settled: false,
        timestamp:
          this.wire.callTimestamp(event.toolCallId) ??
          this.display.coordinator.byId(event.toolCallId)?.reference.messageTimestamp
      });
      this.rebuild();
    } else if (event.type === "agent_settled") {
      this.running = false;
      this.wire.settle();
      for (const update of this.updates.values()) update.settled = true;
      this.rebuild();
    }
  }

  activeThinking(message: TranscriptMessage): ReadonlySet<number> {
    return this.wire.activeThinking(message);
  }

  subscribe(listener: () => void): () => void {
    if (!this.active) return () => {};

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Matching membership and counts are required; a stored summary never supplies arbitrary prose. */
  summary(record: RunRecord) {
    if (record.sessionId !== this.snapshot.sessionId) return;
    const published = this.records.runs.get(`${record.generation}\0${record.id}`)?.record;
    if (!published || JSON.stringify(published) !== JSON.stringify(record)) return;
    const coordinator = this.display.coordinator;
    const first = coordinator.calls.get(callKey(this.snapshot.sessionId, record.first));
    if (!first) return;
    const run = coordinator.run(first);
    if (
      !run ||
      run.members[0] !== first ||
      recordCallKey(run.members.at(-1)?.reference ?? record.first) !== recordCallKey(record.last)
    )
      return;
    if (
      !run.members.every((member) => {
        const provenance = this.records.calls.get(recordCallKey(member.reference));

        return (
          provenance?.generation === record.generation && provenance.sessionId === record.sessionId
        );
      })
    )
      return;
    if (record.final && run.members.some((member) => !member.result)) return;
    const summary = coordinator.summary(first);
    const segments = summary.segments.map((segment) => ({
      category: segment.category.id,
      count: segment.count,
      ...segment.counts
    }));
    if (
      JSON.stringify(segments.slice(0, record.segments.length)) !== JSON.stringify(record.segments)
    )
      return;
    if (segments.length - record.segments.length !== record.omittedSegments) return;
    if (
      segments
        .slice(record.segments.length)
        .reduce((count, segment) => count + segment.count, 0) !== record.omittedItems
    )
      return;

    return { segments: summary.segments.slice(0, record.segments.length) };
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.wire.clear();
    this.updates.clear();
    this.display.dispose();
    this.listeners.clear();
  }
}

export function createTranscriptModel(
  snapshot: TranscriptSnapshot,
  options?: ConstructorParameters<typeof TranscriptModel>[1]
): TranscriptModel {
  return new TranscriptModel(snapshot, options);
}
