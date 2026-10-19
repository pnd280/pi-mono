import type { JsonAgentSessionEvent, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { TaskRecord } from "../tasks/records.ts";
import type { Tasks } from "../tasks/registry.ts";
import { branchTo, readRunAncestry } from "./sessions.ts";
import { Transcript } from "./transcript.ts";

/** A live run's read-only connection: its agent events and its child file's entries. */
export type RunConnection = {
  readonly cwd: string;
  readonly done: Promise<unknown>;
  events(listener: (event: JsonAgentSessionEvent) => void): () => void;
  entries(since?: string): Promise<{ entries: SessionEntry[]; leafId: string | null }>;
};

/** One run's history: its child file's entries from the root to the run's final leaf. */
export type RunHistory = {
  readonly runId: string;
  readonly cwd: string;
  readonly entries: readonly SessionEntry[];
};

/**
 * Read a run's history from its task's child file. The reader keeps the file in memory and never
 * repairs it. With `descendants`, the history names the task's descendants: an active run's history
 * then ends before its marker, because the file names the run before the run's live record arrives,
 * and that run's descendants come only from live records.
 */
export async function readRunFile(
  record: TaskRecord,
  { descendants = false }: { descendants?: boolean } = {}
): Promise<RunHistory> {
  const ancestry = await readRunAncestry(record, descendants && record.state === "active");

  return { runId: record.run_id, ...ancestry };
}

/** A run that is live in this binding, with the child file's entries that its connection reported. */
class LiveRun {
  /** Until the child exits; its file then holds the whole run. */
  connected = true;
  private entries = new Map<string, SessionEntry>();
  private cursor: string | undefined;

  constructor(
    readonly runId: string,
    readonly connection: RunConnection
  ) {}

  /** The run's history; undefined when the child exited before its connection answered. */
  async read(): Promise<RunHistory | undefined> {
    let data;

    try {
      data = await this.connection.entries(this.cursor);
    } catch (error) {
      if (this.connected) throw error;

      return undefined;
    }

    for (const entry of data.entries) this.entries.set(entry.id, entry);
    this.cursor = data.entries.at(-1)?.id ?? this.cursor;

    return {
      runId: this.runId,
      cwd: this.connection.cwd,
      entries: branchTo([...this.entries.values()], data.leafId)
    };
  }
}

/**
 * One task's transcript, which follows the task to each new run. A run that is live in this binding
 * streams into it from the run's start; the child file supplies every other run. The reader holds it
 * while the run is live, and each view holds it; the last release disposes it.
 */
class TaskSource {
  readonly transcript = new Transcript();
  cwd = "";
  unavailable: string | undefined;
  /** Whether the transcript shows a run: a live run began, or a read succeeded. */
  ready = false;
  private live: LiveRun | undefined;
  private unsubscribeLive: (() => void) | undefined;
  private holders = 0;
  private active = true;
  private pending = false;
  private refreshing = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();

  constructor(
    private record: TaskRecord,
    private onDispose: () => void
  ) {}

  retain(): this {
    this.holders++;

    return this;
  }

  release(): void {
    if (--this.holders <= 0) this.dispose();
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

  /** The task's run began in this binding. Its child is not yet prompted, so no event is missed. */
  begin(record: TaskRecord, connection: RunConnection): void {
    if (!this.active) return;
    this.unsubscribeLive?.();
    const live = new LiveRun(record.run_id, connection);
    this.record = record;
    this.live = live;
    this.cwd = connection.cwd;
    this.ready = true;
    this.unavailable = undefined;
    this.transcript.observe(record.run_id);
    this.unsubscribeLive = connection.events((event) => {
      try {
        this.event(event);
      } catch {
        this.unavailable = "Transcript update unavailable";
      }
    });
    void connection.done.then(() => this.finish(live));
    this.changed();
    this.refresh();
  }

  /** The task's current record. A file source reads again; a live run reports its own changes. */
  follow(record: TaskRecord): void {
    if (!this.active || record === this.record) return;
    this.record = record;
    if (this.live?.runId !== record.run_id || !this.live.connected) this.refresh();
  }

  /** The record's run history: from the run's connection while it is live, else from the file. */
  async read(record: TaskRecord): Promise<RunHistory> {
    const live = this.live;
    const history = live?.runId === record.run_id && live.connected ? await live.read() : undefined;

    return history ?? readRunFile(record);
  }

  private event(event: JsonAgentSessionEvent): void {
    // Calls that another tool made are not part of the child's own transcript.
    if (!this.active || ("parentToolCallId" in event && event.parentToolCallId)) return;
    this.transcript.event(event);
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

  private async load(): Promise<void> {
    if (!this.active || this.refreshing) return;
    this.refreshing = true;
    this.pending = false;
    const record = this.record;

    try {
      const history = await this.read(record);
      if (!this.isActive()) return;

      // The task started another run while this read was in flight.
      if (history.runId !== this.record.run_id) {
        this.pending = true;

        return;
      }

      this.cwd = history.cwd;
      this.ready = true;
      this.transcript.replace(history, this.record.state === "active");
      this.unavailable = undefined;
      this.changed();
    } catch (error) {
      if (!this.isActive() || record.run_id !== this.record.run_id) return;
      const live = this.live?.runId === record.run_id && this.live.connected;
      if (live) this.unavailable = "Child transcript unavailable";
      else this.unavailable = error instanceof Error ? error.message : "Transcript unavailable";
      this.changed();
    } finally {
      this.refreshing = false;
      if (this.pending) this.refresh();
    }
  }

  /** A live run's child exited; its child file now holds the whole run. */
  private finish(live: LiveRun): void {
    live.connected = false;
    if (!this.active || live !== this.live) return;
    this.unsubscribeLive?.();
    this.unsubscribeLive = undefined;
    this.transcript.stop();
    this.refresh();
  }

  private dispose(): void {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    this.unsubscribeLive?.();
    this.listeners.clear();
    this.transcript.dispose();
    this.onDispose();
  }
}

/** A view of a task's transcript. The transcript is the same object for each run of the task. */
export class TaskView {
  private source: TaskSource | undefined;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;

  constructor(source: TaskSource) {
    this.source = source.retain();
    this.unsubscribe = source.subscribe(() => this.changed());
    source.refresh();
  }

  /** The task's transcript once it shows a run. */
  get transcript(): Transcript | undefined {
    return this.source?.ready ? this.source.transcript : undefined;
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

  dispose(): void {
    this.unsubscribe();
    this.source?.release();
    this.source = undefined;
    this.listeners.clear();
  }
}

/**
 * Reads tasks' runs: live from a direct task's connection while its run is active, and from the
 * child file otherwise. It holds each live run's source from the run's start, so a view opened
 * later still has the run's streamed events. Each source follows its task's current record.
 */
export class RunReader {
  /** Each task's source while its run is live here or a view shows it. */
  private sources = new Map<string, TaskSource>();
  /** The sources that the reader holds for their live runs. */
  private live = new Map<TaskSource, RunConnection>();
  private unsubscribe: () => void;

  constructor(private tasks: Pick<Tasks, "subscribe" | "owned">) {
    this.unsubscribe = tasks.subscribe((event) => {
      // Tasks reports a run before its child is prompted.
      if (event.kind === "run") this.begin(event.record, event.run);

      for (const [taskId, source] of this.sources) {
        const record = this.record(taskId);
        if (record) source.follow(record);
      }
    });
  }

  private record(taskId: string): TaskRecord | undefined {
    try {
      return this.tasks.owned(taskId);
    } catch {
      return undefined;
    }
  }

  private source(record: TaskRecord): TaskSource {
    const id = record.task_id;
    const existing = this.sources.get(id);
    if (existing) return existing;

    const source: TaskSource = new TaskSource(record, () => {
      if (this.sources.get(id) === source) this.sources.delete(id);
    });
    this.sources.set(id, source);

    return source;
  }

  private begin(record: TaskRecord, run: RunConnection): void {
    const source = this.source(record);
    if (!this.live.has(source)) source.retain();
    this.live.set(source, run);
    source.begin(record, run);
    void run.done.then(() => {
      if (this.live.get(source) !== run) return;
      this.live.delete(source);
      source.release();
    });
  }

  /** A task's record and the history of the run that the record names. */
  async read(taskId: string): Promise<{ record: TaskRecord; history: RunHistory }> {
    const record = this.tasks.owned(taskId);
    const source = this.sources.get(taskId);

    return { record, history: await (source ? source.read(record) : readRunFile(record)) };
  }

  /** A view of a task's transcript that follows the task to each new run. */
  observe(taskId: string): TaskView {
    const record = this.tasks.owned(taskId);
    const source = this.source(record);
    source.follow(record);

    return new TaskView(source);
  }

  dispose(): void {
    this.unsubscribe();
    for (const source of this.live.keys()) source.release();
    this.live.clear();
  }
}
