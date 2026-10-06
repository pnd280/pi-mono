import { randomUUID } from "node:crypto";

import type { Usage } from "@earendil-works/pi-ai";
import {
  SessionManager,
  type JsonAgentSessionEvent,
  type SessionEntry,
  type SessionStats
} from "@earendil-works/pi-coding-agent";
import { acquireLock } from "@pi-mono/libs/private-files";

import { Capacity } from "./capacity.ts";
import { readCheckpoint, restoreCheckpoint, saveCheckpoint } from "./checkpoints.ts";
import { ChildRun, type ChildOptions, type ChildResult } from "./child.ts";
import type { SubagentsConfig } from "./config.ts";
import {
  RELAY_ENTRY,
  TRANSFER_ENTRY,
  TRANSFER_PENDING_ENTRY,
  TASK_ENTRY,
  RESULT_MESSAGE,
  CONTROL_REPLY_ENTRY,
  STOP_GRACE_MS,
  KILL_GRACE_MS
} from "./constants.ts";
import { requestControl, type Control } from "./control.ts";
import {
  appendRecord,
  parsePendingTransfer,
  rebuildOwnership,
  type TaskRecord,
  type TransferRecord
} from "./records.ts";
import { Relay, type Reservation } from "./relay.ts";
import {
  boundedText,
  detailsSchema,
  detailsUsage,
  sumUsage,
  usageDifference,
  type ToolDetails
} from "./result.ts";
import { descendantRecords, readTaskSession } from "./sessions.ts";
import { TaskSource } from "./source.ts";

export type ManagedTask = {
  run: ChildRun;
  done: Promise<ChildResult>;
  details: ToolDetails;
  prompt: string;
  source: TaskSource;
  background: Promise<void>;
  promote(): void;
  /** Child stats when a background or promoted call returned; its returned usage ends here. */
  reported?: SessionStats;
};

export type TaskEvent =
  | { kind: "changed"; taskId?: string }
  | { kind: "completed"; task: ManagedTask; result: ChildResult };

/**
 * The model and Pi thinking level that a child event reports as used. A failed response can name
 * a virtual model that never ran, so only completed or aborted responses count.
 */
function appliedSelection(
  event: JsonAgentSessionEvent,
  current: { model: string; thinking: string }
): { model: string; thinking: string } | undefined {
  if (event.type === "thinking_level_changed")
    return { model: current.model, thinking: event.level };
  if (
    event.type !== "message_end" ||
    event.message.role !== "assistant" ||
    event.message.stopReason === "error"
  )
    return undefined;

  return {
    model: `${event.message.provider}/${event.message.model}`,
    thinking: event.message.thinkingLevel ?? current.thinking
  };
}

/** The record field for the child's reported context use, if any. */
function contextOf(stats: SessionStats | undefined): Pick<TaskRecord, "context"> {
  const usage = stats?.contextUsage;

  return usage ? { context: { tokens: usage.tokens, window: usage.contextWindow } } : {};
}

/**
 * Adds a finished message's usage, including late background usage, to the live total.
 * A model request also sets the cache hit rate, unless it has no prompt.
 */
function withMessageUsage(
  record: TaskRecord,
  message: Extract<JsonAgentSessionEvent, { type: "message_end" }>["message"],
  previousUsage: ToolDetails["usage"]
): TaskRecord {
  let usage: Usage | undefined;
  if (message.role === "assistant" || message.role === "toolResult") usage = message.usage;
  else if (message.role === "custom" && message.customType === RESULT_MESSAGE)
    usage = detailsSchema.safeParse(message.details).data?.late_usage?.usage;
  if (!usage) return record;
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;

  return {
    ...record,
    usage: sumUsage(record.usage ?? previousUsage, detailsUsage(usage)),
    ...(message.role === "assistant" && prompt > 0
      ? { cache_hit: (usage.cacheRead / prompt) * 100 }
      : {})
  };
}

function matchesTransfer(record: TransferRecord, receipt: TransferRecord | undefined): boolean {
  return (
    receipt !== undefined &&
    receipt.recipient_session_id === record.recipient_session_id &&
    receipt.parent_task_id === record.parent_task_id &&
    receipt.session_file === record.session_file
  );
}

/** Process-owned children and branch-owned history; neither depends on terminal mounting. */
export class Tasks {
  readonly capacity: Capacity;
  readonly relay: Relay;
  private records: Map<string, TaskRecord>;
  private transfers: Map<string, TransferRecord>;
  private pending: ReturnType<typeof rebuildOwnership>["pending"];
  private lifetime = new AbortController();
  private live = new Map<string, ManagedTask>();
  private processes = new Set<ManagedTask>();
  private claimed = new Set<string>();
  private listeners = new Set<(event: TaskEvent) => void>();
  private closed = false;
  private revisions = new Map<string, number>();
  private sources = new Set<TaskSource>();
  private changedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Cards carry the session identity, so cards replayed after a reload or resume stay openable. */
  readonly bindingId: string;

  get activeBinding(): boolean {
    return !this.closed;
  }

  constructor(
    private config: SubagentsConfig,
    entries: readonly SessionEntry[],
    private options: {
      depth: number;
      sessionId: string;
      sessionFile: string | undefined;
      taskId?: string;
      warn?(message: string): void;
      append(type: string, data: unknown): void;
      input?(taskId: string, prompt: string, delivery: "steer" | "follow_up"): Promise<ToolDetails>;
    }
  ) {
    this.bindingId = options.sessionId;
    this.capacity = new Capacity(config.maxConcurrent, config.maxQueued);
    const ownership = rebuildOwnership(entries);
    this.records = ownership.tasks;
    this.transfers = ownership.transfers;
    this.pending = ownership.pending;
    this.relay = new Relay({
      sessionId: options.taskId ?? options.sessionId,
      depth: options.depth,
      maxConcurrent: config.maxConcurrent,
      capacity: this.capacity,
      append: (message) => {
        if (!this.closed) options.append(RELAY_ENTRY, message);
      },
      forward: (id, message) => this.forward(id, `relay ${JSON.stringify(message)}`),
      belongsTo: (parent, id) => this.belongsTo(parent, id),
      accepts: (child, record) => {
        const previous = this.records.get(record.task_id);

        return (
          record.task_id !== (this.options.taskId ?? this.options.sessionId) &&
          !this.transfers.has(record.task_id) &&
          !this.belongsTo(record.task_id, child) &&
          (!previous ||
            previous.parent_task_id === record.parent_task_id ||
            (record.parent_task_id !== null &&
              previous.parent_task_id !== null &&
              this.belongsTo(record.parent_task_id, previous.parent_task_id)))
        );
      },
      record: (record) => {
        this.remember(record);
        this.changed(record.task_id);
      },
      changed: (id) => this.changed(id)
    });
  }

  async recover(): Promise<void> {
    const descendants = await descendantRecords(
      this.list(),
      this.options.sessionId,
      this.transfers.keys()
    );
    if (this.closed) return;
    for (const record of descendants)
      if (!this.records.has(record.task_id)) this.records.set(record.task_id, record);

    // Only this ancestry's durable transfer intent permits receipt recovery. The receipt
    // is ownership authority, never a source for child conversation or descendant history.
    for (const intent of this.pending.values()) {
      const authority = await this.transferAuthority(intent.record);
      if (!this.activeBinding) return;
      const receipt =
        authority && rebuildOwnership(authority.getBranch()).transfers.get(intent.record.task_id);
      if (matchesTransfer(intent.record, receipt))
        this.records.set(intent.record.task_id, this.received(intent.record));
    }
  }

  list(): TaskRecord[] {
    const records = [...this.records.values()];
    const result: TaskRecord[] = [];
    const visited = new Set<string>();

    const visit = (parent: string | null) => {
      for (const record of records) {
        if (record.parent_task_id !== parent || visited.has(record.task_id)) continue;
        visited.add(record.task_id);
        result.push(record);
        visit(record.task_id);
      }
    };

    visit(this.options.depth === 0 ? null : (this.options.taskId ?? this.options.sessionId));

    return result;
  }

  direct(): ManagedTask[] {
    return [...this.processes];
  }

  active(taskId: string): ManagedTask | undefined {
    return this.live.get(taskId);
  }

  subscribe(listener: (event: TaskEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TaskEvent): void {
    if (this.closed) return;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* Observers cannot change process lifetime. */
      }
    }
  }

  private changed(taskId?: string): void {
    this.emit({ kind: "changed", ...(taskId ? { taskId } : {}) });
  }

  claim(taskId?: string): () => void {
    if (this.closed) throw new Error("Subagent session ended");

    if (taskId === undefined) return () => {};

    const record = this.owned(taskId);
    if (record.state === "active" || this.claimed.has(taskId))
      throw new Error("Task is active or already waiting to resume");
    this.claimed.add(taskId);

    return () => {
      this.claimed.delete(taskId);
    };
  }

  async update(
    taskId: string,
    prompt: string,
    delivery: "steer" | "follow_up"
  ): Promise<ToolDetails | undefined> {
    if (this.closed) throw new Error("Subagent session ended");
    if (this.owned(taskId).state !== "active") return;
    const task = this.live.get(taskId);

    if (!task) {
      const owner = this.route(taskId);
      const reply = await requestControl(owner.run, {
        kind: "input",
        task_id: taskId,
        prompt,
        delivery
      });
      this.lifetime.signal.throwIfAborted();
      if (reply)
        return {
          ...detailsSchema.parse(reply.details),
          state: "running",
          ended_at: null,
          usage: detailsUsage()
        };
      await owner.done;

      return;
    }

    if (await task.run.input(prompt, delivery === "steer" ? "steer" : "followUp")) {
      this.lifetime.signal.throwIfAborted();

      return { ...task.details, state: "running", ended_at: null, delivery, usage: detailsUsage() };
    }

    await task.done;

    return;
  }

  async control(value: Control & { request_id: string }): Promise<void> {
    try {
      if (this.closed) throw new Error("Subagent session ended");
      let details: ToolDetails | undefined;
      let record: TaskRecord | undefined;

      if (value.kind === "adopt") await this.relinquish(value.record);
      else if (value.kind === "abort") record = await this.abort(value.task_id, value.reason);
      else {
        this.owned(value.task_id);
        if (!this.options.input) throw new Error("Subagent input handler unavailable");
        details = await this.options.input(value.task_id, value.prompt, value.delivery);
      }

      this.lifetime.signal.throwIfAborted();
      this.options.append(CONTROL_REPLY_ENTRY, {
        request_id: value.request_id,
        ...(details ? { details } : {}),
        ...(record ? { record } : {})
      });
    } catch (error) {
      if (this.closed) return;
      this.options.append(CONTROL_REPLY_ENTRY, {
        request_id: value.request_id,
        error: boundedText(error instanceof Error ? error.message : "Subagent control failed", 10)
      });
    }
  }

  private transferred(
    record: TransferRecord,
    transfers: ReadonlyMap<string, TransferRecord>
  ): boolean {
    const receipt = transfers.get(record.task_id);
    if (!receipt) return false;
    if (!matchesTransfer(record, receipt))
      throw new Error("Previous supervisor no longer owns this task");

    return true;
  }

  private async relinquish(record: TransferRecord): Promise<void> {
    if (this.transferred(record, this.transfers)) return;
    const previous = this.owned(record.task_id);
    const unclaim = this.claim(record.task_id);

    try {
      if (previous.session_file !== record.session_file)
        throw new Error("Task session identity changed");
      if (previous.parent_task_id !== (this.options.taskId ?? this.options.sessionId))
        await this.transfer(previous, record);
      this.lifetime.signal.throwIfAborted();
      this.options.append(TRANSFER_ENTRY, record);
      this.transfers.set(record.task_id, record);
      this.records.delete(record.task_id);
      this.changed(record.task_id);
    } finally {
      unclaim();
    }
  }

  /** A stopped previous owner is intentionally opened for a metadata write, never for viewing. */
  private async transfer(previous: TaskRecord, record: TransferRecord): Promise<void> {
    if (previous.parent_task_id === null) throw new Error("Cannot transfer a root-owned task");
    const owner = this.owned(previous.parent_task_id);

    if (owner.state === "active" && previous.owner_session_id === owner.session_id) {
      const route = this.route(owner.task_id);
      if (await requestControl(route.run, { kind: "adopt", record })) return;
      await route.done;
      await this.transfer(previous, record);
    } else {
      // All stopped-owner writers share this boundary, including competing ancestors
      // in other processes. Read the authoritative branch only after acquiring it.
      const authority = {
        ...owner,
        session_id: previous.owner_session_id,
        session_file: previous.owner_session_file ?? owner.session_file
      };
      const lock = await acquireLock(`${authority.session_file}.pi-subagents.lock`, {
        signal: this.lifetime.signal,
        timeoutMs: 5_000
      });

      try {
        const source = await readTaskSession(authority);
        if (!source) throw new Error("Previous supervisor has an incomplete session file");
        const ownership = rebuildOwnership(source.getBranch());
        if (this.transferred(record, ownership.transfers)) return;
        const old = ownership.tasks.get(previous.task_id);
        if (!old || old.parent_task_id !== owner.task_id)
          throw new Error("Previous supervisor no longer owns this task");
        if (old.session_file !== record.session_file)
          throw new Error("Task session identity changed");
        this.lifetime.signal.throwIfAborted();
        const writer = SessionManager.open(authority.session_file);
        if (writer.getSessionId() !== authority.session_id)
          throw new Error("Previous supervisor identity changed");
        writer.appendCustomEntry(TRANSFER_ENTRY, record);
        const saved = await readCheckpoint(owner);
        const receipt: SessionEntry = {
          type: "custom",
          customType: TRANSFER_ENTRY,
          data: record,
          id: randomUUID(),
          parentId: saved.leafId,
          timestamp: new Date().toISOString()
        };
        const checkpoint = await saveCheckpoint(
          owner.task_id,
          {
            ...saved,
            entries: [...saved.entries, receipt],
            leafId: receipt.id
          },
          this.lifetime.signal,
          this.warn
        );
        this.lifetime.signal.throwIfAborted();
        this.save({ ...owner, checkpoint });
      } finally {
        await lock.release();
      }
    }
  }

  private async transferAuthority(record: TaskRecord) {
    if (!record.owner_session_file) return;

    return readTaskSession({
      ...record,
      session_file: record.owner_session_file,
      session_id: record.owner_session_id
    });
  }

  async adopt(taskId: string | undefined): Promise<void> {
    if (!taskId) return;
    const previous = this.owned(taskId);
    const parent =
      this.options.depth === 0 ? null : (this.options.taskId ?? this.options.sessionId);

    if (previous.parent_task_id === parent) {
      if (this.options.depth > 0 && previous.owner_session_id !== this.options.sessionId) {
        const authority = await this.transferAuthority(previous);
        this.lifetime.signal.throwIfAborted();
        if (authority && rebuildOwnership(authority.getBranch()).transfers.has(taskId))
          throw new Error("Task does not belong to this session");
      }

      return;
    }

    const record = {
      ...previous,
      parent_task_id: parent,
      recipient_session_id: this.options.sessionId
    };
    const intent = parsePendingTransfer({ record, from_task_id: previous.parent_task_id });
    if (!intent) throw new Error("Subagent transfer intent is invalid or too large");
    this.options.append(TRANSFER_PENDING_ENTRY, intent);
    await this.transfer(previous, record);
    this.lifetime.signal.throwIfAborted();
    this.save(this.received(record));
  }

  private received(record: TaskRecord): TaskRecord {
    return {
      ...record,
      owner_session_id: this.options.sessionId,
      owner_session_file: this.options.sessionFile
    };
  }

  private warn = (message: string): void => {
    if (this.activeBinding) this.options.warn?.(message);
  };

  async resume(taskId: string | undefined) {
    if (taskId === undefined) return;
    const restored = await restoreCheckpoint(this.owned(taskId), this.lifetime.signal, this.warn);
    this.lifetime.signal.throwIfAborted();
    const warning = restored.interrupted
      ? "This checkpoint has an incomplete tool cycle. Old calls are not replayed automatically. Completed effects remain; the model can request the operation again."
      : undefined;
    if (warning) this.warn(warning);

    return { ...restored, warning };
  }

  start(
    description: string,
    options: ChildOptions,
    reservation: Reservation,
    background: boolean
  ): ManagedTask {
    if (this.closed) throw new Error("Subagent session ended");
    let record = options.taskId === undefined ? undefined : this.owned(options.taskId);
    // A resume adds this run's usage to the total of earlier runs.
    const previousUsage = record?.usage ?? detailsUsage();
    const taskId = options.taskId ?? randomUUID();
    let captures = Promise.resolve();

    const capture = () => {
      captures = captures.then(async () => {
        if (this.closed || !record) return;
        const snapshot = await run.snapshot();
        const stats = await run.stats();
        const checkpoint = await saveCheckpoint(taskId, snapshot, this.lifetime.signal, this.warn);
        if (!this.activeBinding) return;
        record = this.save({ ...record, checkpoint, ...contextOf(stats) });
      });

      return captures;
    };

    const promotion = Promise.withResolvers<void>();
    const details: ToolDetails = {
      binding_id: this.bindingId,
      description: boundedText(description),
      model: options.model,
      thinking: options.thinking,
      background,
      delivery: options.streamingBehavior === "steer" ? "steer" : "follow_up",
      state: "running",
      started_at: Date.now(),
      ended_at: null,
      activity: "",
      usage: detailsUsage()
    };
    const { onActivity, ...childOptions } = options;
    const run = new ChildRun({
      ...childOptions,
      sessionName: description,
      taskId,
      onCheckpoint: capture,
      // A descendant needs its full EOF/TERM/KILL interval before its supervisor
      // can be forced down. Capacity also bounds the number of possible levels.
      shutdownGraceMs: Math.min(
        2_147_483_647,
        STOP_GRACE_MS +
          Math.max(0, Math.min(this.config.maxDepth, this.config.maxConcurrent) - options.depth) *
            (STOP_GRACE_MS + KILL_GRACE_MS)
      ),
      onStart: async (start) => {
        const checkpoint = await saveCheckpoint(
          taskId,
          await run.snapshot(),
          this.lifetime.signal,
          this.warn
        );
        this.lifetime.signal.throwIfAborted();
        details.task_id = taskId;
        details.model = boundedText(start.model ?? options.model);
        details.thinking = boundedText(start.thinking);
        record = this.save({
          task_id: taskId,
          session_id: start.sessionId,
          checkpoint,
          owner_session_id: this.options.sessionId,
          ...(options.parentSession ? { owner_session_file: options.parentSession } : {}),
          parent_task_id:
            this.options.depth === 0 ? null : (this.options.taskId ?? this.options.sessionId),
          description,
          session_file: start.sessionFile,
          model: start.model ?? options.model,
          thinking: start.thinking,
          background: details.background,
          started_at: Date.now(),
          ended_at: null,
          usage: previousUsage,
          ...contextOf(start.usageStart),
          ...(record?.cache_hit === undefined ? {} : { cache_hit: record.cache_hit }),
          state: "active",
          outcome: null,
          ...(reservation.requestId ? { slot_request_id: reservation.requestId } : {})
        });
        this.live.set(taskId, task);
        task.source.start(record);
        await options.onStart?.(start);
        this.changed(start.taskId);
      },
      onEvent: (event) => {
        if (this.closed) return;
        const applied = record && appliedSelection(event, record);

        if (
          record &&
          applied &&
          (applied.model !== record.model || applied.thinking !== record.thinking)
        ) {
          details.model = boundedText(applied.model);
          details.thinking = boundedText(applied.thinking);
          record = this.save({ ...record, ...applied });
        }

        // The next checkpoint save persists the live total; the run's end replaces it with exact stats.
        if (record && event.type === "message_end")
          record = withMessageUsage(record, event.message, previousUsage);

        if (
          record &&
          (event.type === "message_end" ||
            (event.type === "entry_appended" &&
              event.entry.type === "custom" &&
              [TASK_ENTRY, TRANSFER_ENTRY, TRANSFER_PENDING_ENTRY].includes(
                event.entry.customType
              )))
        )
          void capture().catch(() => {});
        if (record) this.event(record.task_id, event);
        options.onEvent?.(event);
      }
    });
    const source = new TaskSource({
      run,
      cwd: options.cwd,
      activity: (activity) => {
        if (this.closed) return;
        details.activity = activity;
        onActivity?.(activity);
        this.changed(details.task_id);
      }
    });
    this.sources.add(source);
    const task: ManagedTask = {
      run,
      details,
      source,
      prompt: options.prompt,
      background: promotion.promise,
      promote: () => {
        if (this.closed || details.background || !this.processes.has(task)) return;
        if (record) record = this.save({ ...record, background: true });
        details.background = true;
        promotion.resolve();
        this.changed(details.task_id);
      },
      done: run.done.then(async (result) => {
        await captures.catch(() => {});
        details.state = result.outcome;
        details.ended_at = Date.now();
        details.usage = detailsUsage(
          result.usageStart && result.usageEnd
            ? usageDifference(result.usageStart, result.usageEnd)
            : undefined
        );

        if (record) {
          const finished = {
            state: "inactive" as const,
            outcome: result.outcome,
            ended_at: details.ended_at,
            ...contextOf(result.usageEnd),
            usage:
              result.usageStart && result.usageEnd
                ? sumUsage(previousUsage, details.usage)
                : (record.usage ?? previousUsage)
          };

          try {
            if (!this.closed && result.outcome === "cancelled") {
              const snapshot = source.cancelledCheckpoint(await readCheckpoint(record));

              if (snapshot) {
                const checkpoint = await saveCheckpoint(
                  taskId,
                  snapshot,
                  this.lifetime.signal,
                  this.warn
                );
                record = { ...record, checkpoint };
              }
            }

            record = this.save({ ...record, ...finished });
          } catch {
            this.remember({ ...record, ...finished });
          }

          source.start(record);
          this.live.delete(record.task_id);
          this.relay.exited(record.task_id);

          for (const descendant of this.records.values()) {
            if (descendant.state === "active" && this.belongsTo(record.task_id, descendant.task_id))
              this.remember({ ...descendant, state: "inactive", outcome: "cancelled" });
          }

          this.notifyChange(record.task_id, true);
        }

        source.finish();
        this.processes.delete(task);
        reservation.release();
        this.emit({ kind: "completed", task, result });

        return result;
      })
    };
    this.processes.add(task);
    if (background) promotion.resolve();

    return task;
  }

  private event(taskId: string, event: JsonAgentSessionEvent): void {
    if (this.closed) return;
    if (event.type === "entry_appended") this.relay.receive(taskId, event.entry);
    if (
      event.type !== "entry_appended" &&
      event.type !== "message_end" &&
      event.type !== "agent_settled"
    )
      return;
    this.changed(taskId);

    this.notifyChange(taskId);
  }

  private notifyChange(taskId: string, immediate = false): void {
    if (this.options.depth === 0 || this.closed) return;

    const publish = () => {
      this.changedTimers.delete(taskId);
      if (this.closed) return;
      const revision = (this.revisions.get(taskId) ?? 0) + 1;
      this.revisions.set(taskId, revision);

      try {
        this.options.append(RELAY_ENTRY, { kind: "session-changed", task_id: taskId, revision });
      } catch {
        /* A refresh hint must not interrupt process cleanup. */
      }
    };

    if (immediate) {
      clearTimeout(this.changedTimers.get(taskId));
      publish();
    } else if (!this.changedTimers.has(taskId))
      this.changedTimers.set(taskId, setTimeout(publish, 100));
  }

  private belongsTo(parent: string, taskId: string): boolean {
    const seen = new Set<string>();
    let current: string | null = taskId;

    while (current !== null && !seen.has(current)) {
      if (current === parent) return true;
      seen.add(current);
      current = this.records.get(current)?.parent_task_id ?? null;
    }

    return false;
  }

  private route(taskId: string): ManagedTask {
    this.owned(taskId);
    for (const [id, task] of this.live) if (this.belongsTo(id, taskId)) return task;
    throw new Error("Task is inactive");
  }

  private async forward(taskId: string, command: string): Promise<void> {
    const task = this.route(taskId);
    const response = await task.run.connection.request({
      type: "prompt",
      message: `/subagents ${command}`
    });
    if (
      !response.success ||
      response.command !== "prompt" ||
      response.data.disposition !== "handled"
    )
      throw new Error("Subagent command was not handled");
  }

  async abort(
    taskId: string,
    reason = "Cancelled by user"
  ): Promise<TaskRecord & { state: "inactive"; outcome: "cancelled" }> {
    if (this.owned(taskId).state !== "active") throw new Error("Task is inactive");
    const task = this.live.get(taskId);
    let record: TaskRecord;

    if (!task) {
      const reply = await requestControl(this.route(taskId).run, {
        kind: "abort",
        task_id: taskId,
        reason
      });
      this.lifetime.signal.throwIfAborted();
      if (!reply) throw new Error("Task is inactive");
      if (
        !reply.record ||
        reply.record.task_id !== taskId ||
        reply.record.state !== "inactive" ||
        reply.record.outcome !== "cancelled"
      )
        throw new Error("Invalid subagent abort acknowledgement");
      record = reply.record;
    } else {
      void task.run.cancel(reason);
      const result = await task.done;
      record = this.owned(taskId);
      // Process exit can precede managed-task cleanup, leaving an already finished run in live.
      if (result.outcome !== "cancelled") throw new Error("Task is inactive");
    }

    if (record.state !== "inactive" || record.outcome !== "cancelled")
      throw new Error("Task is inactive");

    return { ...record, outcome: record.outcome };
  }

  async background(taskId?: string): Promise<TaskRecord[]> {
    if (taskId === undefined) {
      if (this.options.depth !== 0) throw new Error("A task ID is required in a child supervisor");
      for (const task of this.processes) task.promote();

      return this.list().filter((record) => this.live.has(record.task_id));
    }

    const record = this.owned(taskId);
    if (record.state !== "active") throw new Error("Task is inactive");
    if (record.background) throw new Error("Task is already in the background");
    const task = this.live.get(taskId);
    if (task) task.promote();
    else await this.forward(taskId, `background ${taskId}`);

    return [this.owned(taskId)];
  }

  invalidate(): void {
    this.closed = true;
    this.lifetime.abort();
    this.capacity.shutdown();
    this.relay.invalidate();
    for (const source of this.sources) source.dispose();
    for (const timer of this.changedTimers.values()) clearTimeout(timer);
    this.changedTimers.clear();
  }

  async shutdown(immediate = false): Promise<void> {
    this.invalidate();
    const tasks = [...this.processes];

    for (const task of tasks) {
      if (immediate) void task.run.terminate("Cancelled by session navigation");
      else void task.run.cancel("Cancelled by session shutdown");
    }

    await Promise.all(tasks.map((task) => task.done));
    this.relay.shutdown();
    for (const source of this.sources) source.dispose();
    this.sources.clear();
    this.listeners.clear();
  }

  owned(taskId: string): TaskRecord {
    if (this.closed) throw new Error("Subagent session ended");
    const record = this.list().find((record) => record.task_id === taskId);
    if (!record) throw new Error("Task does not belong to this session");

    return record;
  }

  private save(record: TaskRecord): TaskRecord {
    if (this.closed) return record;
    const saved = appendRecord((type, value) => this.options.append(type, value), record);
    this.remember(saved);
    this.changed(record.task_id);

    return saved;
  }

  private remember(record: TaskRecord): void {
    this.records.set(record.task_id, record);
  }
}
