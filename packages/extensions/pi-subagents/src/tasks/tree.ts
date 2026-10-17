import { isDeepStrictEqual } from "node:util";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { readRunFile } from "../history/reader.ts";
import { stopRun, taskHistory, type TaskRecord } from "./records.ts";

/** An observed tree reads child files again this often: another process can add descendants. */
const REFRESH_MS = 1_000;

/**
 * How soon this process's supervisor needs a live record. A run's start, promotion, and end, and
 * each accepted descendant update, are immediate; other child events are debounced.
 */
export type Urgency = "immediate" | "debounced";

/**
 * One change of the tree. `taskId` names the changed task; a file read that removed tasks names
 * none. Only a live record is published, because each supervisor reads child files itself.
 */
export type TreeChange = {
  taskId?: string;
  publish?: { record: TaskRecord; urgency: Urgency };
};

/**
 * The tasks that the child files of `roots` name, at any depth. Each run's ancestry names its
 * child's tasks; the run reader stops an active run's ancestry at its marker. An unreadable file
 * adds no descendants.
 */
async function fileDescendants(roots: readonly TaskRecord[]): Promise<TaskRecord[]> {
  const seen = new Set(roots.map((task) => task.task_id));
  const found: TaskRecord[] = [];
  const pending = [...roots];

  for (const task of pending) {
    let entries: readonly SessionEntry[];

    try {
      ({ entries } = await readRunFile(task, { descendants: true }));
    } catch {
      continue;
    }

    for (const child of taskHistory(entries, task.task_id).values()) {
      if (seen.has(child.task_id)) continue;
      seen.add(child.task_id);
      found.push(child);
      pending.push(child);
    }
  }

  return found;
}

/**
 * The task tree of one supervisor binding, as ADR 0003 defines it. The selected ancestry names the
 * direct tasks, child files name their descendants, and live records from this binding's runs and
 * from descendant updates replace what the files show. It lists the tree depth first, each task's
 * children in the order the tree learned them.
 */
export class TaskTree {
  /** Records by task ID in the order the tree learned them. */
  private records: Map<string, TaskRecord>;
  /** Descendants from the latest applied file read; a live record replaces one. */
  private read = new Set<string>();
  /** Sequence numbers of the latest started and applied file reads. */
  private reads = { started: 0, applied: 0 };
  /** The listed records in depth-first order, and by ID; rebuilt after a change. */
  private order: { list: readonly TaskRecord[]; byId: ReadonlyMap<string, TaskRecord> } | undefined;
  private observers = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  constructor(
    entries: readonly SessionEntry[],
    /** The parent of the direct tasks: this supervisor's own task ID in a child. */
    private readonly parent: string | null,
    /** Receives each change once, when the tree already shows it. */
    private readonly onChange: (change: TreeChange) => void
  ) {
    this.records = taskHistory(entries, parent);
  }

  /** The tasks of this subtree, depth first. A task whose parent is not listed is not listed. */
  list(): readonly TaskRecord[] {
    return this.listed().list;
  }

  /** The tasks this supervisor launched; descendants report to their own supervisors. */
  direct(): TaskRecord[] {
    return this.list().filter((record) => record.parent_task_id === this.parent);
  }

  /** The active tasks of this subtree, or only the descendants of `taskId`. */
  active(taskId?: string): TaskRecord[] {
    return this.list().filter(
      (record) =>
        record.state === "active" &&
        (taskId === undefined ||
          (record.task_id !== taskId && this.belongsTo(taskId, record.task_id)))
    );
  }

  /** A listed task. */
  find(taskId: string): TaskRecord | undefined {
    return this.listed().byId.get(taskId);
  }

  /** A listed task; a task outside this subtree throws. */
  owned(taskId: string): TaskRecord {
    const record = this.find(taskId);
    if (!record) throw new Error("Task does not belong to this session");

    return record;
  }

  /** Whether `taskId` is `parent` or one of its descendants. */
  belongsTo(parent: string, taskId: string): boolean {
    const seen = new Set<string>();
    let current: string | null = taskId;

    while (current !== null && !seen.has(current)) {
      if (current === parent) return true;
      seen.add(current);
      current = this.records.get(current)?.parent_task_id ?? null;
    }

    return false;
  }

  /** Store a live record of one of this binding's runs. It replaces a record from a file. */
  update(record: TaskRecord, urgency: Urgency): void {
    this.read.delete(record.task_id);
    // An unchanged record keeps the listed order.
    if (this.records.get(record.task_id) !== record) this.order = undefined;
    this.records.set(record.task_id, record);
    this.onChange({ taskId: record.task_id, publish: { record, urgency } });
  }

  /**
   * Store the final record of one of this binding's runs and publish it at once. A task whose run
   * ended has no active descendants, so the tree first stops each that is still active.
   */
  end(record: TaskRecord): void {
    for (const descendant of this.active(record.task_id))
      this.update(stopRun(descendant), "immediate");

    this.update(record, "immediate");
  }

  /**
   * Store a descendant update that the child of the direct task `child` sent, and publish it at
   * once. The tree accepts it only when its parent is `child` or one of its descendants, it names
   * neither this supervisor nor `child` or an ancestor of `child`, and a known task keeps its parent.
   */
  accept(child: string, record: TaskRecord): boolean {
    const previous = this.records.get(record.task_id);
    if (
      record.parent_task_id === null ||
      !this.belongsTo(child, record.parent_task_id) ||
      record.task_id === this.parent ||
      this.belongsTo(record.task_id, child) ||
      (previous !== undefined && previous.parent_task_id !== record.parent_task_id)
    )
      return false;
    this.update(record, "immediate");

    return true;
  }

  /**
   * Read the descendants again from child files: a process outside this binding can add them. It
   * resolves when the tree shows this read or one that started later, because a later read wins.
   */
  async refresh(): Promise<void> {
    const sequence = ++this.reads.started;
    const descendants = await fileDescendants(
      this.list().filter((record) => !this.read.has(record.task_id))
    );
    if (this.closed || sequence < this.reads.applied) return;
    this.reads.applied = sequence;
    const found = new Set(descendants.map((record) => record.task_id));
    let removed = false;

    for (const taskId of this.read) {
      if (found.has(taskId)) continue;
      this.read.delete(taskId);
      this.records.delete(taskId);
      removed = true;
    }

    const updated: string[] = [];

    for (const record of descendants) {
      const previous = this.records.get(record.task_id);
      if (previous && (!this.read.has(record.task_id) || isDeepStrictEqual(previous, record)))
        continue;
      this.records.set(record.task_id, record);
      this.read.add(record.task_id);
      updated.push(record.task_id);
    }

    if (removed || updated.length) this.order = undefined;
    if (removed) this.onChange({});
    for (const taskId of updated) this.onChange({ taskId });
  }

  /**
   * Keep the tree fresh while it is observed: read now, then every second until the returned stop
   * ends the last observation.
   */
  observe(): () => void {
    if (this.closed) return () => {};

    let observing = true;
    this.observers++;
    this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
    void this.refresh();

    return () => {
      if (!observing) return;
      observing = false;
      if (--this.observers > 0) return;
      clearInterval(this.timer);
      this.timer = undefined;
    };
  }

  /** The binding ended: file reads stop. Live records still apply, so the last state stays listed. */
  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Each listed task once, below its parent; a record in a parent cycle is not listed. */
  private listed(): { list: readonly TaskRecord[]; byId: ReadonlyMap<string, TaskRecord> } {
    if (this.order) return this.order;
    const children = new Map<string | null, TaskRecord[]>();

    for (const record of this.records.values()) {
      const siblings = children.get(record.parent_task_id);
      if (siblings) siblings.push(record);
      else children.set(record.parent_task_id, [record]);
    }

    const list: TaskRecord[] = [];
    const byId = new Map<string, TaskRecord>();

    const visit = (parent: string | null) => {
      for (const record of children.get(parent) ?? []) {
        if (byId.has(record.task_id)) continue;
        byId.set(record.task_id, record);
        list.push(record);
        visit(record.task_id);
      }
    };

    visit(this.parent);
    this.order = { list, byId };

    return this.order;
  }
}
