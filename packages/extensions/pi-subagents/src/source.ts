import type { JsonAgentSessionEvent, SessionEntry } from "@earendil-works/pi-coding-agent";
import { truncateHead } from "@earendil-works/pi-coding-agent";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import {
  createTranscriptModel,
  parseTranscriptRecord,
  persistDisplayFact,
  readSavedOutput,
  summarizeRun,
  TRANSCRIPT_TYPE,
  type TranscriptModel,
  type TranscriptSnapshot
} from "pi-tool-display/viewer";

import { checkpointSession, readCheckpoint } from "./checkpoints.ts";
import type { ChildRun } from "./child.ts";
import type { TaskRecord } from "./records.ts";

/** One task connection or checkpoint. Owns transport; the display model owns interpretation. */
export class TaskSource {
  cwd = "";
  model: TranscriptModel | undefined;
  unavailable: string | undefined;
  private active = true;
  private connected: boolean;
  private task: TaskRecord | undefined;
  private entries = new Map<string, SessionEntry>();
  private cursor: string | undefined;
  private pending = false;
  private refreshing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generations = new Map<string, string>();
  private liveCalls = new Set<string>();
  private currentCall: string | undefined;
  private fallback = "";
  private activity = "";
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | undefined;

  constructor(
    private options: {
      run?: ChildRun;
      cwd?: string;
      task?: TaskRecord;
      activity?(text: string): void;
    }
  ) {
    this.task = options.task;
    this.connected = options.run !== undefined;

    if (options.run) {
      this.unsubscribe = options.run.connection.subscribe((record) => {
        try {
          if (record.type !== "response" && record.type !== "extension_ui_request")
            this.event(record);
        } catch {
          this.unavailable = "Transcript update unavailable";
        }
      });
    }
  }

  start(task: TaskRecord): void {
    if (!this.active) return;
    this.task = task;

    if (this.connected && !this.model) {
      this.cwd = this.options.cwd ?? "";
      // The child is not prompted until start returns. Observe its events immediately;
      // snapshot replacement preserves live execution while it supplies saved provenance.
      this.model = createTranscriptModel(
        { sessionId: task.session_id, cwd: this.cwd, entries: [], leafId: null },
        { readSavedOutput }
      );
      this.changed();
    }

    this.refresh();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private isActive(): boolean {
    return this.active;
  }

  private isConnected(): boolean {
    return this.connected;
  }

  private needsRefresh(): boolean {
    return this.pending;
  }

  private provenance(event: JsonAgentSessionEvent): void {
    if (event.type === "message_end" && event.message.role === "assistant") {
      for (const [index, block] of event.message.content.entries()) {
        if (block.type === "toolCall")
          this.liveCalls.add(JSON.stringify([event.message.timestamp, index, block.id]));
      }
    }

    if (
      event.type === "entry_appended" &&
      event.entry.type === "custom" &&
      event.entry.customType === TRANSCRIPT_TYPE
    ) {
      const record = parseTranscriptRecord(event.entry.data);

      if (record?.kind === "runtime") {
        this.generations.set(record.sessionId, record.generation);
        if (record.sessionId === this.task?.session_id) this.resetActivity();
      } else if (
        record?.kind === "call" &&
        record.sessionId === this.task?.session_id &&
        this.liveCalls.has(
          JSON.stringify([
            record.call.messageTimestamp,
            record.call.contentIndex,
            record.call.toolCallId
          ])
        )
      ) {
        // RPC subscribes after session_start, so the runtime marker can precede the stream.
        // A streamed call assertion tied to this connection's observed assistant identifies
        // the generation; summarizeRun still requires its authoritative runtime marker.
        this.generations.set(record.sessionId, record.generation);
      }
    }
  }

  private event(event: JsonAgentSessionEvent): void {
    if (!this.active || ("parentToolCallId" in event && event.parentToolCallId)) return;
    this.provenance(event);
    if (event.type === "agent_start") this.resetActivity();

    if (event.type === "tool_execution_start") {
      this.currentCall = event.toolCallId;
      this.fallback = truncateHead(compactDisplayText(event.toolName), {
        maxBytes: 2048,
        maxLines: 1
      }).content;
      this.setActivity(this.fallback);
    }

    this.model?.event(event);
    if (
      ["entry_appended", "message_end", "agent_settled", "auto_compaction_end"].includes(event.type)
    )
      this.refresh();
  }

  private resetActivity(): void {
    this.currentCall = undefined;
    this.liveCalls.clear();
    this.fallback = "";
    this.setActivity("");
  }

  refresh(): void {
    if (!this.active || !this.task) return;
    this.pending = true;
    if (this.refreshing || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.load();
    }, 30);
  }

  private async snapshot(): Promise<TranscriptSnapshot> {
    if (!this.task) throw new Error("Subagent task is unavailable");
    const run = this.options.run;

    if (run && this.connected) {
      try {
        const response = await run.connection.request({
          type: "get_entries",
          ...(this.cursor ? { since: this.cursor } : {})
        });

        if (this.isConnected()) {
          if (!response.success || response.command !== "get_entries")
            throw new Error("Cannot read child entries");
          for (const entry of response.data.entries) this.entries.set(entry.id, entry);
          this.cursor = response.data.entries.at(-1)?.id ?? this.cursor;

          return {
            sessionId: this.task.session_id,
            cwd: this.options.cwd ?? "",
            entries: [...this.entries.values()],
            leafId: response.data.leafId
          };
        }
      } catch {
        if (this.isConnected()) throw new Error("Child transcript unavailable");
      }
    }

    return { ...(await readCheckpoint(this.task)), historical: true };
  }

  private async load(): Promise<void> {
    if (!this.active || this.refreshing) return;
    this.refreshing = true;
    this.pending = false;

    try {
      const snapshot = await this.snapshot();
      if (!this.isActive()) return;
      this.cwd = snapshot.cwd;

      if (this.model) this.model.replace(snapshot);
      else this.model = createTranscriptModel(snapshot);
      this.unavailable = undefined;
      this.updateActivity();
      this.changed();
    } catch (error) {
      if (!this.isActive()) return;
      this.unavailable = error instanceof Error ? error.message : "Transcript unavailable";
      this.changed();
    } finally {
      this.refreshing = false;
      if (this.needsRefresh()) this.refresh();
    }
  }

  private updateActivity(): void {
    if (!this.model || !this.task || !this.currentCall) return;
    const generation = this.generations.get(this.task.session_id);
    if (!generation) return;
    const coordinator = this.model.display.coordinator;
    const call = coordinator.byId(this.currentCall);

    if (!call || coordinator.run(call)?.members.some((member) => member.lifecycle !== "complete")) {
      this.setActivity(this.fallback);

      return;
    }

    for (const { record } of [...this.model.records.runs.values()].reverse()) {
      if (record.last.toolCallId !== this.currentCall) continue;
      if (
        !this.liveCalls.has(
          JSON.stringify([
            record.last.messageTimestamp,
            record.last.contentIndex,
            record.last.toolCallId
          ])
        )
      )
        continue;
      const summary = summarizeRun(this.model, record, {
        sessionId: this.task.session_id,
        generation
      });
      if (!summary) continue;
      this.setActivity(summary.text || this.fallback);

      return;
    }

    this.setActivity(this.fallback);
  }

  private setActivity(text: string): void {
    if (!this.active || text === this.activity) return;
    this.activity = text;
    this.options.activity?.(text);
  }

  /** After owned process exit, retain cancellation only for calls observed live on this connection. */
  cancelledCheckpoint(snapshot: TranscriptSnapshot): TranscriptSnapshot | undefined {
    if (!this.model) return;
    const saved = createTranscriptModel({ ...snapshot, historical: true });
    const manager = checkpointSession(snapshot);

    try {
      for (const call of this.model.display.coordinator.calls.values()) {
        const retained = saved.display.coordinator.calls.get(call.key);
        if (
          call.origin !== "live" ||
          !["preparing", "queued", "executing"].includes(call.lifecycle) ||
          retained?.name !== call.name ||
          retained.lifecycle === "complete"
        )
          continue;
        persistDisplayFact(
          (type, data) => manager.appendCustomEntry(type, data),
          retained.reference,
          retained.adapter.id,
          { kind: "cancellation", availability: "available" }
        );
      }
    } finally {
      saved.dispose();
    }

    if (manager.getLeafId() === snapshot.leafId) return;

    return { ...snapshot, entries: manager.getEntries(), leafId: manager.getLeafId() };
  }

  finish(): void {
    this.connected = false;
    this.resetActivity();
    this.unsubscribe?.();
    this.refresh();
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.listeners.clear();
    this.model?.dispose();
  }
}
