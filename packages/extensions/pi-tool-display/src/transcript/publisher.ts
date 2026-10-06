import { randomUUID } from "node:crypto";

import type {
  AgentSession,
  ExtensionAPI,
  ExtensionContext,
  SessionEntry,
  ToolInfo
} from "@earendil-works/pi-coding-agent";

import { ADAPTER_CONTRACT_VERSION } from "../adapters/recorded.ts";
import type { DisplayCall, DisplayRun, ToolDisplayAdapter } from "../contracts.ts";
import { hostToolResult } from "./messages.ts";
import {
  TRANSCRIPT_TYPE,
  SUMMARY_SEGMENTS,
  parseTranscriptRecord,
  recordCallKey,
  resultAfter,
  type CallRecord,
  type RunRecord,
  type TranscriptRecord
} from "./records.ts";
import type { DisplaySession } from "./session.ts";

type Selection = {
  name: string;
  adapter: ToolDisplayAdapter | undefined;
  info: ToolInfo | undefined;
};

type PublisherRuntime = {
  sessionManager: ExtensionContext["sessionManager"];
  getAllTools: AgentSession["getAllTools"];
};

/** Writable collection only. Renderers and foreign replay never receive this object. */
export class TranscriptPublisher {
  readonly generation = randomUUID();
  private sessionId: string;
  private active = true;
  private started = false;
  private selections = new Map<string, Selection>();
  private calls = new Map<string, { signature: string; record: CallRecord }>();
  private finalCalls = new Set<string>();
  private boundaries = new Map<string, { call: DisplayCall; kind: "group" | "run" }>();
  private publishedBoundaries = new Set<string>();
  private runs = new Map<string, { signature: string; record: RunRecord; publishedAt: number }>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private session: PublisherRuntime,
    private display: () => DisplaySession,
    private append: ExtensionAPI["appendEntry"] | undefined
  ) {
    this.sessionId = session.sessionManager.getSessionId();
  }

  start(): void {
    if (!this.active || this.started || !this.display().settings.valid) return;
    this.started = this.write({ ...this.base(), kind: "runtime" });
  }

  private base() {
    return {
      version: 1 as const,
      generation: this.generation,
      sessionId: this.sessionId
    };
  }

  private write(value: TranscriptRecord): boolean {
    if (
      !this.active ||
      !this.append ||
      this.session.sessionManager.getSessionId() !== this.sessionId
    )
      return false;

    try {
      const parsed = parseTranscriptRecord(value);
      if (!parsed) return false;
      this.append(TRANSCRIPT_TYPE, parsed);

      return true;
    } catch {
      return false;
    }
  }

  capture(
    timestamp: number,
    calls: readonly { id: string; name: string }[],
    select: (name: string) => ToolDisplayAdapter | undefined
  ): void {
    if (!this.active) return;
    const tools = new Map(this.session.getAllTools().map((tool) => [tool.name, tool]));
    for (const call of calls)
      this.selections.set(JSON.stringify([timestamp, call.id, call.name]), {
        name: call.name,
        adapter: select(call.name),
        info: tools.get(call.name)
      });
  }

  /** Coalesce render-time fallback notifications outside the renderer's stack. */
  request(): void {
    if (!this.active || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.publish();
    }, 1000);
    this.timer.unref();
  }

  boundary(call: DisplayCall, kind: "group" | "run"): void {
    if (!this.active || call.origin !== "live") return;
    this.boundaries.set(`${call.key}:${kind}`, { call, kind });
    this.publish();
  }

  private publishBoundaries(): void {
    for (const { call, kind } of this.boundaries.values()) {
      const reference = this.reference(call);
      if (!reference) continue;
      const id = `${reference.messageEntryId}:${reference.contentIndex}:${kind}`;
      if (this.publishedBoundaries.has(id)) continue;
      if (
        this.write({
          ...this.base(),
          kind: "boundary",
          id,
          call: reference,
          revision: 1,
          boundary: kind
        })
      )
        this.publishedBoundaries.add(id);
    }
  }

  publish(): void {
    if (!this.active || !this.display().settings.valid) return;
    this.start();
    if (!this.started) return;
    const entries = this.session.sessionManager.getBranch();
    this.publishCalls(entries);
    this.publishBoundaries();
    const watermark = [...entries].reverse().find((entry) => entry.type !== "custom")?.id;
    if (!watermark) return;
    const coordinator = this.display().coordinator;
    const seen = new Set<object>();

    for (const call of coordinator.calls.values()) {
      const run = coordinator.run(call);
      if (!run || seen.has(run)) continue;
      seen.add(run);
      this.publishRun(run, entries, watermark);
    }
  }

  private publishCalls(entries: readonly SessionEntry[]): void {
    for (const entry of entries) {
      if (entry.type !== "message" || entry.message.role !== "assistant") continue;

      for (const [index, block] of entry.message.content.entries()) {
        if (block.type !== "toolCall") continue;
        const selected = this.selections.get(
          JSON.stringify([entry.message.timestamp, block.id, block.name])
        );
        if (!selected) continue;
        this.publishCall(
          {
            messageEntryId: entry.id,
            messageTimestamp: entry.message.timestamp,
            contentIndex: index,
            toolCallId: block.id
          },
          selected,
          block.arguments
        );
      }
    }
  }

  private publishCall(reference: CallRecord["call"], selected: Selection, args: unknown): void {
    const key = recordCallKey(reference);
    if (this.finalCalls.has(key)) return;
    const coordinator = this.display().coordinator;
    const call = coordinator.byId(reference.toolCallId);
    let effective = selected.adapter;

    if (
      call?.origin === "live" &&
      call.name === selected.name &&
      call.reference.messageTimestamp === reference.messageTimestamp &&
      call.reference.contentIndex === reference.contentIndex
    ) {
      coordinator.setReferenceEntry(call, reference.messageEntryId);
      coordinator.add(reference, selected.name, args, call.adapter, "live", call.expanded);
      effective = coordinator.interpretation(call).adapter;
    }

    const previous = this.calls.get(key);
    const source = selected.info?.sourceInfo;
    let selection: CallRecord["selection"] = { kind: "original" };
    if (effective)
      selection =
        effective.id === "generic"
          ? { kind: "generic" }
          : { kind: "adapter", id: effective.id, version: ADAPTER_CONTRACT_VERSION };
    const record: CallRecord = {
      ...this.base(),
      kind: "call",
      call: reference,
      name: selected.name,
      revision: (previous?.record.revision ?? 0) + 1,
      selection,
      ...(source
        ? {
            source: {
              source: source.source,
              path: source.path,
              scope: source.scope,
              origin: source.origin
            }
          }
        : {})
    };
    const signature = JSON.stringify({ ...record, revision: 0 });
    if (signature !== previous?.signature && this.write(record))
      this.calls.set(key, { signature, record });
  }

  private reference(call: DisplayCall | undefined): CallRecord["call"] | undefined {
    return call && this.calls.get(recordCallKey(call.reference))?.record.call;
  }

  private publishRun(run: DisplayRun, entries: readonly SessionEntry[], watermark: string): void {
    if (
      !run.members.every(
        (member) => member.origin === "live" && this.reference(member) !== undefined
      )
    )
      return;
    const leader = run.members[0];
    const first = this.reference(leader);
    const last = this.reference(run.members.at(-1));
    if (!leader || !first || !last) return;
    const id = `${first.messageEntryId}:${first.contentIndex}`;
    const previous = this.runs.get(id);
    if (previous?.record.final) return;
    const coordinator = this.display().coordinator;
    this.reconcileResults(run, entries);
    const closed = coordinator.runClosed(leader);
    const final = closed && run.members.every((member) => this.terminal(member, entries));
    const summary = coordinator.summary(leader);
    const segments = summary.segments.slice(0, SUMMARY_SEGMENTS).map((segment) => ({
      category: segment.category.id,
      count: segment.count,
      ...segment.counts
    }));
    const record: RunRecord = {
      ...this.base(),
      kind: "run",
      id,
      revision: (previous?.record.revision ?? 0) + 1,
      first,
      last,
      watermark,
      closed,
      final,
      segments,
      omittedSegments: summary.segments.length - segments.length,
      omittedItems: summary.segments
        .slice(segments.length)
        .reduce((total, segment) => total + segment.count, 0)
    };

    boundRun(record);

    const signature = JSON.stringify({ ...record, revision: 0, watermark: "" });
    if (signature === previous?.signature) return;

    if (!final && previous && Date.now() - previous.publishedAt < 1000) {
      this.request();

      return;
    }

    if (this.write(record)) {
      this.runs.set(id, { signature, record, publishedAt: Date.now() });
      if (final)
        for (const member of run.members) this.finalCalls.add(recordCallKey(member.reference));
    }
  }

  private terminal(call: DisplayCall, entries: readonly SessionEntry[]): boolean {
    if (call.lifecycle !== "complete") return false;

    return resultAfter(call.reference, call.name, entries) !== undefined;
  }

  private reconcileResults(run: DisplayRun, entries: readonly SessionEntry[]): void {
    for (const member of run.members) {
      const result = resultAfter(member.reference, member.name, entries);
      if (result && member.result !== result)
        this.display().coordinator.result(
          member,
          hostToolResult(result),
          result.isError ? "failure" : "success"
        );
    }
  }

  dispose(): void {
    if (!this.active) return;
    this.publish();
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.selections.clear();
    this.calls.clear();
    this.finalCalls.clear();
    this.boundaries.clear();
    this.publishedBoundaries.clear();
    this.runs.clear();
  }
}

function boundRun(record: RunRecord): void {
  while (!parseTranscriptRecord(record) && record.segments.length) {
    record.omittedItems += record.segments.pop()?.count ?? 0;
    record.omittedSegments++;
  }
}
