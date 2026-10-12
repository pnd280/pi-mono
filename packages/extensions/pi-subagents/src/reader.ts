import type { JsonAgentSessionEvent, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { TaskRecord } from "./records.ts";
import { readTaskSnapshot } from "./sessions.ts";
import type { TaskEvent, Tasks } from "./tasks.ts";
import { Transcript, type TranscriptSnapshot } from "./transcript.ts";

/** A live run's read-only connection: its agent events and its child file's entries. */
export type RunConnection = {
  readonly cwd: string;
  readonly done: Promise<unknown>;
  events(listener: (event: JsonAgentSessionEvent) => void): () => void;
  entries(since?: string): Promise<{ entries: SessionEntry[]; leafId: string | null }>;
};

/**
 * One run's transcript: streamed from the run's connection while the run is live, then read
 * from the child file. The reader and each view hold it; the last release disposes it.
 */
class RunSource {
  cwd = "";
  transcript: Transcript | undefined;
  unavailable: string | undefined;
  private holders = 0;
  private active = true;
  private entries = new Map<string, SessionEntry>();
  private cursor: string | undefined;
  private pending = false;
  private refreshing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | undefined;

  constructor(
    private task: TaskRecord,
    private connection?: RunConnection
  ) {
    if (connection) {
      // The child is not prompted before the run's start returns, so no event is missed;
      // snapshots then supply the saved entries.
      this.cwd = connection.cwd;
      this.transcript = new Transcript(true);
      this.unsubscribe = connection.events((event) => {
        try {
          this.event(event);
        } catch {
          this.unavailable = "Transcript update unavailable";
        }
      });
      void connection.done.then(() => this.finish());
    }

    this.refresh();
  }

  get runId(): string {
    return this.task.run_id;
  }

  /** The connection while the run is live. */
  get live(): RunConnection | undefined {
    return this.connection;
  }

  retain(): this {
    this.holders++;

    return this;
  }

  release(): void {
    if (--this.holders <= 0) this.dispose();
  }

  /** Read again for the task's current record; a file source can move to the task's next run. */
  start(task: TaskRecord): void {
    if (!this.active || (this.connection && task.run_id !== this.task.run_id)) return;
    this.task = task;
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

  /** Disposal can happen while a read is in flight. */
  private isActive(): boolean {
    return this.active;
  }

  private event(event: JsonAgentSessionEvent): void {
    // Calls that another tool made are not part of the child's own transcript.
    if (!this.active || ("parentToolCallId" in event && event.parentToolCallId)) return;
    this.transcript?.event(event);
    if (
      ["entry_appended", "message_end", "agent_settled", "auto_compaction_end"].includes(event.type)
    )
      this.refresh();
  }

  refresh(): void {
    if (!this.active) return;
    this.pending = true;
    if (this.refreshing || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.load();
    }, 30);
  }

  private async snapshot(): Promise<TranscriptSnapshot> {
    const task = this.task;
    const connection = this.connection;

    if (connection) {
      try {
        const data = await connection.entries(this.cursor);

        if (this.connection) {
          for (const entry of data.entries) this.entries.set(entry.id, entry);
          this.cursor = data.entries.at(-1)?.id ?? this.cursor;

          return {
            sessionId: task.session_id,
            runId: task.run_id,
            cwd: connection.cwd,
            entries: [...this.entries.values()],
            leafId: data.leafId
          };
        }
      } catch {
        if (this.connection) throw new Error("Child transcript unavailable");
      }
    }

    return readTaskSnapshot(task);
  }

  private async load(): Promise<void> {
    if (!this.active || this.refreshing) return;
    this.refreshing = true;
    this.pending = false;

    try {
      const snapshot = await this.snapshot();
      if (!this.isActive()) return;

      // The task started another run while this read was in flight.
      if (snapshot.runId !== this.task.run_id) {
        this.pending = true;

        return;
      }

      this.cwd = snapshot.cwd;
      (this.transcript ??= new Transcript(false)).replace(snapshot, this.task.state === "active");
      this.unavailable = undefined;
      this.changed();
    } catch (error) {
      if (!this.isActive()) return;
      this.unavailable = error instanceof Error ? error.message : "Transcript unavailable";
      this.changed();
    } finally {
      this.refreshing = false;
      if (this.pending) this.refresh();
    }
  }

  /** The run's process exited; its child file now holds the whole run. */
  private finish(): void {
    if (!this.connection) return;
    this.connection = undefined;
    this.unsubscribe?.();
    this.transcript?.stop();
    this.refresh();
  }

  private dispose(): void {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.listeners.clear();
    this.transcript?.dispose();
    this.transcript = undefined;
  }
}

/** A task's transcript that follows the task to each new run. */
export class TaskView {
  private source: RunSource | undefined;
  private listeners = new Set<() => void>();
  private unsubscribeSource: (() => void) | undefined;
  private unsubscribe: () => void;

  constructor(
    private reader: RunReader,
    tasks: Pick<Tasks, "subscribe">,
    private taskId: string,
    record: TaskRecord
  ) {
    this.show(reader.source(record));
    this.unsubscribe = tasks.subscribe((event) => this.update(event));
  }

  get transcript(): Transcript | undefined {
    return this.source?.transcript;
  }

  get unavailable(): string | undefined {
    return this.source?.unavailable;
  }

  get cwd(): string {
    return this.source?.cwd ?? "";
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

  private show(source: RunSource): void {
    this.unsubscribeSource?.();
    this.source?.release();
    this.source = source.retain();
    this.unsubscribeSource = source.subscribe(() => this.changed());
    source.refresh();
    this.changed();
  }

  private update(event: TaskEvent): void {
    if (!this.source) return;

    if (event.kind === "run") {
      if (event.record.task_id === this.taskId) this.show(this.reader.source(event.record));
    } else if (!this.source.live && (event.kind === "completed" || event.taskId === this.taskId)) {
      const record = this.reader.record(this.taskId);
      if (record) this.source.start(record);
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.unsubscribeSource?.();
    this.source?.release();
    this.source = undefined;
    this.listeners.clear();
  }
}

/**
 * Reads tasks' runs: live from a direct task's connection while its run is active, and from the
 * child file otherwise. It holds each live run's source from the run's start, so a view opened
 * later still has the run's streamed events.
 */
export class RunReader {
  private live = new Map<string, RunSource>();
  private unsubscribe: () => void;

  constructor(private tasks: Pick<Tasks, "subscribe" | "owned">) {
    this.unsubscribe = tasks.subscribe((event) => {
      if (event.kind !== "run") return;
      const id = event.record.task_id;
      const source = new RunSource(event.record, event.run).retain();
      this.live.get(id)?.release();
      this.live.set(id, source);
      void event.run.done.then(() => {
        if (this.live.get(id) !== source) return;
        this.live.delete(id);
        source.release();
      });
    });
  }

  record(taskId: string): TaskRecord | undefined {
    try {
      return this.tasks.owned(taskId);
    } catch {
      return undefined;
    }
  }

  /** The live source of the record's run, or a new source that reads the child file. */
  source(record: TaskRecord): RunSource {
    const live = this.live.get(record.task_id);

    return live?.live && live.runId === record.run_id ? live : new RunSource(record);
  }

  /** A task's record and a snapshot of the run that the record names. */
  async read(taskId: string): Promise<{ record: TaskRecord; snapshot: TranscriptSnapshot }> {
    const record = this.tasks.owned(taskId);
    const source = this.live.get(taskId);
    const connection = source?.runId === record.run_id ? source.live : undefined;

    if (connection) {
      try {
        const data = await connection.entries();

        return {
          record,
          snapshot: {
            sessionId: record.session_id,
            runId: record.run_id,
            cwd: connection.cwd,
            ...data
          }
        };
      } catch (error) {
        if (source?.live) throw error;
      }
    }

    return { record, snapshot: await readTaskSnapshot(record) };
  }

  /** A view of a task's transcript that follows the task to each new run. */
  observe(taskId: string): TaskView {
    return new TaskView(this, this.tasks, taskId, this.tasks.owned(taskId));
  }

  dispose(): void {
    this.unsubscribe();
    for (const source of this.live.values()) source.release();
    this.live.clear();
  }
}
