import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { Usage } from "@earendil-works/pi-ai";
import type {
  JsonAgentSessionEvent,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  SessionEntry,
  SessionStats
} from "@earendil-works/pi-coding-agent";

import { Capacity } from "./capacity.ts";
import { ChildRun, type ChildResult, type ChildStart } from "./child.ts";
import type { SubagentsConfig } from "./config.ts";
import {
  END_ENTRY,
  KILL_GRACE_MS,
  RUN_ENTRY,
  STOP_GRACE_MS,
  UPDATE_DEBOUNCE_MS
} from "./constants.ts";
import { requestControl } from "./control.ts";
import type { PiInvocation } from "./invocation.ts";
import { WriterLease } from "./lease.ts";
import { errorText, type ChildMessage, type Control, type SlotReply } from "./protocol.ts";
import type { RunConnection } from "./reader.ts";
import {
  applyEvent,
  endRecord,
  endRun,
  promoteRun,
  startRun,
  stopRun,
  taskHistory,
  type RunRecord,
  type TaskRecord
} from "./records.ts";
import { Relay, type Reservation } from "./relay.ts";
import {
  boundedText,
  detailsUsage,
  lateUsage,
  usageDifference,
  type LateUsage,
  type ToolDetails
} from "./result.ts";
import { checkSession, descendantRecords } from "./sessions.ts";
import type { ToolInput } from "./tool-schema.ts";

/** A direct task's process lifetime and the details of the call that started it. */
type ManagedTask = {
  run: ChildRun;
  done: Promise<ChildResult>;
  details: ToolDetails;
  /** Resolves when the task runs in the background, from launch or after promotion. */
  background: Promise<void>;
  promote(): void;
  /** Child stats when a background or promoted call returned; its returned usage ends here. */
  reported?: SessionStats;
  /** `subagent_abort` cancelled the task; its cancellation result goes to nobody. */
  drop?: boolean;
};

export type TaskEvent =
  | { kind: "changed"; taskId?: string }
  /** A direct task's run began; its child is not yet prompted. */
  | { kind: "run"; record: TaskRecord; run: RunConnection }
  /** A direct task's process exited. The fields are a fixed snapshot of its call and result. */
  | {
      kind: "completed";
      details: ToolDetails;
      text: string;
      outcome: ChildResult["outcome"];
      /** Usage after a background or promoted call returned. */
      lateUsage?: LateUsage;
      /** `subagent_abort` cancelled the task, so its result goes to nobody. */
      dropped: boolean;
    };

export const INTERRUPTED_WARNING =
  "The resumed history ends with an incomplete tool cycle. Old calls are not replayed automatically. Completed effects remain; the model can request the operation again.";

/** An inactive direct task whose child file this process now holds the writer lease for. */
type Resumed = { record: TaskRecord; lease: WriterLease };

/** What a `subagent` call sets; the launch context supplies the other values. */
export type SubmitRequest = ToolInput;

/** The supervisor's current selection and environment, read at each launch. */
export type LaunchContext = {
  /** The current model as `provider/id`; without one, a new task must name a model. */
  model: string | undefined;
  thinking: string;
  cwd: string;
  trusted: boolean;
  parentSession: string | undefined;
};

/** Ask the user a child's dialog; no response means that the request needs no answer. */
export type DialogHandler = (
  request: RpcExtensionUIRequest,
  description: string,
  signal: AbortSignal
) => Promise<RpcExtensionUIResponse | undefined>;

export type SubmitHandlers = {
  /** A turn abort: it ends a wait for capacity and terminates a foreground run. */
  signal?: AbortSignal;
  /** The call's current details, while the call is open. */
  onChange?(details: ToolDetails): void;
  /** The dialogs of the started run, also after a background call returns. */
  onUIRequest: DialogHandler;
};

/** The result of one call; the caller formats it. */
export type Submission =
  /** Input reached an active task, and the call returns at once. */
  | { kind: "input"; details: ToolDetails }
  /** The task continues in the background; `usage` is its run's usage until the return. */
  | { kind: "background"; details: ToolDetails; usage: Usage | undefined; interrupted: boolean }
  /** The run ended, or the call failed with `text` as its error. */
  | {
      kind: "result";
      details: ToolDetails;
      text: string;
      usage: Usage | undefined;
      interrupted: boolean;
    };

export type Aborted = {
  record: TaskRecord & { state: "inactive"; outcome: "cancelled" };
  /** A direct task's final call details. */
  details?: ToolDetails;
};

/** A call's model and thinking level, and the launch context they came from. */
type Selection = { launch: LaunchContext; model: string; thinking: string };

function queuedDetails(request: SubmitRequest, { model, thinking }: Selection): ToolDetails {
  return {
    ...(request.task_id === undefined ? {} : { task_id: request.task_id }),
    description: boundedText(request.description),
    model: boundedText(model),
    thinking: boundedText(thinking),
    background: request.background ?? false,
    delivery: request.delivery ?? "follow_up",
    state: "queued",
    started_at: Date.now(),
    ended_at: null,
    activity: "",
    usage: detailsUsage()
  };
}

/** A call that failed after it claimed its task; a turn abort cancels it. */
function failure(details: ToolDetails, error: unknown, aborted: boolean): Submission {
  return {
    kind: "result",
    details: { ...details, state: aborted ? "cancelled" : "failed", ended_at: Date.now() },
    text: error instanceof Error ? error.message : "Subagent call failed",
    usage: undefined,
    interrupted: false
  };
}

/** Process-owned children and branch-owned history; neither depends on terminal mounting. */
export class Tasks {
  private readonly capacity: Capacity;
  private readonly relay: Relay;
  /** The parent of this supervisor's direct tasks: its own task ID in a child. */
  private readonly parent: string | null;
  private records: Map<string, TaskRecord>;
  /** Descendants from the latest file read; live updates and this binding's runs replace them. */
  private read = new Set<string>();
  /** Sequence numbers of the latest started and applied descendant reads. */
  private reads = { started: 0, applied: 0 };
  private lifetime = new AbortController();
  private live = new Map<string, ManagedTask>();
  private processes = new Set<ManagedTask>();
  private claimed = new Set<string>();
  private listeners = new Set<(event: TaskEvent) => void>();
  private closed = false;
  private updates = new Map<string, ReturnType<typeof setTimeout>>();
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
      taskId?: string;
      invocation: PiInvocation;
      launch(): LaunchContext;
      /** This process's `subagents` extension entry, when Pi loaded it from a file. */
      extension?: string;
      warn?(message: string): void;
      append(type: string, data: unknown): void;
      /** Send a coordination message to this process's supervisor. */
      send?(message: ChildMessage): void;
    }
  ) {
    this.bindingId = options.sessionId;
    this.parent = options.depth === 0 ? null : (options.taskId ?? null);
    this.capacity = new Capacity(config.maxConcurrent, config.maxQueued);
    this.records = taskHistory(entries, this.parent);
    this.relay = new Relay({
      self: this.parent ?? undefined,
      maxConcurrent: config.maxConcurrent,
      capacity: this.capacity,
      send: (message) => this.send(message),
      reply: async (child, message) => this.reply(child, message),
      belongsTo: (parent, id) => this.belongsTo(parent, id),
      accepts: (child, record) => {
        const previous = this.records.get(record.task_id);

        return (
          record.task_id !== this.parent &&
          !this.belongsTo(record.task_id, child) &&
          (!previous || previous.parent_task_id === record.parent_task_id)
        );
      },
      record: (record) => {
        this.remember(record);
        this.changed(record.task_id);
        this.publish(record.task_id, true);
      }
    });
  }

  /**
   * Read inactive descendants again from the child files of this branch's runs. A process outside
   * this binding can still add descendants to a file. A read that started later wins.
   */
  async readDescendants(): Promise<void> {
    const sequence = ++this.reads.started;
    const descendants = await descendantRecords(
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

    if (removed) this.changed();
    for (const taskId of updated) this.changed(taskId);
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

    visit(this.parent);

    return result;
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

  /** The latest top-level tool of an active direct task; empty for other tasks. */
  activity(taskId: string): string {
    return this.live.get(taskId)?.details.activity ?? "";
  }

  /**
   * Run one call: input to an active task, or a launch or resume that waits for capacity. A
   * foreground call returns the run's result; a background or promoted call returns when its run
   * starts. Errors before the task is claimed throw; later failures return as a result.
   */
  async submit(request: SubmitRequest, handlers: SubmitHandlers): Promise<Submission> {
    const { signal } = handlers;
    if (signal?.aborted) throw new Error("Cancelled by turn abort");
    const input = await this.input(request);
    if (input) return input;
    const selection = this.selection(request);
    const unclaim = this.claim(request.task_id);
    let open = true;
    let reservation: Reservation | undefined;
    let resumed: Resumed | undefined;
    let task: ManagedTask | undefined;
    let details = queuedDetails(request, selection);

    const change = () => {
      if (!open || this.closed) return;

      // A presentation callback must not throw out of a child event or leak the running process.
      try {
        handlers.onChange?.(details);
      } catch {
        /* The final result still carries the latest details. */
      }
    };

    const abort = () => {
      if (task && !task.details.background) void task.run.terminate("Cancelled by turn abort");
    };

    try {
      change();
      reservation = await this.relay.acquire(signal);
      if (signal?.aborted) throw new Error("Cancelled by turn abort");
      resumed = await this.resume(request.task_id);
      signal?.throwIfAborted();
      details = { ...details, state: "running", started_at: Date.now() };
      task = this.start(request, selection, reservation, resumed, change, handlers.onUIRequest);
      details = task.details;
      change();
      signal?.addEventListener("abort", abort, { once: true });

      return await this.returned(task);
    } catch (error) {
      if (task && !task.details.background)
        await task.run.cancel("Cancelled after subagent call failure");

      return failure(details, error, signal?.aborted ?? false);
    } finally {
      open = false;
      signal?.removeEventListener("abort", abort);

      // A call that started no task returns the lease and capacity it took.
      if (!task) {
        await resumed?.lease.release().catch(() => {});
        reservation?.release();
      }

      unclaim();
    }
  }

  /**
   * The requested model and thinking level. A resume reuses each omitted value from the task's
   * latest run; a new task uses the supervisor's current one.
   */
  private selection(request: SubmitRequest): Selection {
    const launch = this.options.launch();
    const previous = request.task_id === undefined ? undefined : this.owned(request.task_id);
    const model = request.model ?? previous?.requested_model ?? launch.model;
    if (model === undefined) throw new Error("Select a model before launching a subagent");
    const thinking = request.thinking ?? previous?.requested_thinking ?? launch.thinking;

    return { launch, model, thinking };
  }

  /**
   * Send input to an active task of this subtree. Undefined when the task is inactive, or when
   * its process exits before it accepts the input; the call then resumes the task.
   */
  private async input(request: SubmitRequest): Promise<Submission | undefined> {
    const taskId = request.task_id;
    if (taskId === undefined) return;
    if (this.closed) throw new Error("Subagent session ended");
    if (this.owned(taskId).state !== "active") return;
    const delivery = request.delivery ?? "follow_up";
    const task = this.live.get(taskId);
    let details: ToolDetails;

    if (task) {
      if (!(await task.run.input(request.prompt, delivery === "steer" ? "steer" : "followUp"))) {
        await task.done;

        return;
      }

      this.lifetime.signal.throwIfAborted();
      details = { ...task.details, delivery };
    } else {
      const owner = this.route(taskId);
      const reply = await requestControl(owner.run, {
        kind: "input",
        task_id: taskId,
        prompt: request.prompt,
        delivery
      });
      this.lifetime.signal.throwIfAborted();

      if (!reply?.details) {
        await owner.done;

        return;
      }

      details = reply.details;
    }

    // An input call's details describe that call, which returns at once.
    const now = Date.now();

    return {
      kind: "input",
      details: {
        ...details,
        state: "running",
        started_at: now,
        ended_at: now,
        returned: "input",
        usage: detailsUsage()
      }
    };
  }

  private claim(taskId?: string): () => void {
    if (this.closed) throw new Error("Subagent session ended");

    if (taskId === undefined) return () => {};

    const record = this.owned(taskId);
    if (record.state === "active" || this.claimed.has(taskId))
      throw new Error("Task is active or already waiting to resume");
    if (record.parent_task_id !== this.parent) throw new Error("Only direct tasks can be resumed");
    this.claimed.add(taskId);

    return () => {
      this.claimed.delete(taskId);
    };
  }

  /** Handle input, abort, or promotion from this process's supervisor for a task of this subtree. */
  async control(value: Control, onUIRequest: DialogHandler): Promise<void> {
    let reply: ChildMessage;

    try {
      if (this.closed) throw new Error("Subagent session ended");

      if (value.kind === "abort") {
        const { record } = await this.abort(value.task_id, { reason: value.reason });
        reply = { kind: "control-reply", request_id: value.request_id, record };
      } else if (value.kind === "background") {
        const record = await this.promote(value.task_id);
        reply = { kind: "control-reply", request_id: value.request_id, record };
      } else {
        const { description } = this.owned(value.task_id);
        const result = await this.submit(
          {
            task_id: value.task_id,
            prompt: value.prompt,
            delivery: value.delivery,
            description,
            background: true
          },
          { onUIRequest }
        );
        if (
          result.kind === "result" &&
          (result.details.state === "failed" || result.details.state === "cancelled")
        )
          throw new Error(result.text);
        reply = { kind: "control-reply", request_id: value.request_id, details: result.details };
      }
    } catch (error) {
      reply = {
        kind: "control-reply",
        request_id: value.request_id,
        error: errorText(error, "Subagent control failed")
      };
    }

    this.send(reply);
  }

  /** Handle a slot reply from this process's supervisor. */
  slot(reply: SlotReply): Promise<void> {
    return this.relay.reply(reply);
  }

  private warn = (message: string): void => {
    if (this.activeBinding) this.options.warn?.(message);
  };

  /** Take the writer lease of a claimed direct task, then check its child file under the lease. */
  private async resume(taskId: string | undefined): Promise<Resumed | undefined> {
    if (taskId === undefined) return;
    const record = this.owned(taskId);
    const lease = await WriterLease.acquire(record.session_file, [process.pid]);

    try {
      await checkSession(record);
      this.lifetime.signal.throwIfAborted();
    } catch (error) {
      await lease.release().catch(() => {});
      throw error;
    }

    return { record, lease };
  }

  private start(
    request: SubmitRequest,
    { launch, model, thinking }: Selection,
    reservation: Reservation,
    resumed: Resumed | undefined,
    change: () => void,
    onUIRequest: DialogHandler
  ): ManagedTask {
    if (this.closed) throw new Error("Subagent session ended");
    const { description } = request;
    const depth = this.options.depth + 1;
    let record = resumed?.record;
    /** The record from this run's start; its `end` adds to the usage of earlier runs. */
    let started: TaskRecord | undefined;
    const taskId = record?.task_id ?? randomUUID();
    const runId = randomUUID();
    let lease = resumed?.lease;
    let usageStart: SessionStats | undefined;
    let starting: Promise<void> = Promise.resolve();
    const promotion = Promise.withResolvers<void>();
    const dialogs = new AbortController();
    const details: ToolDetails = {
      binding_id: this.bindingId,
      description: boundedText(description),
      model,
      thinking,
      background: request.background ?? false,
      delivery: request.delivery ?? "follow_up",
      state: "running",
      started_at: Date.now(),
      ended_at: null,
      activity: "",
      usage: detailsUsage()
    };

    const begin = async (start: ChildStart) => {
      const pid = run.connection.process.pid;
      if (pid === undefined) throw new Error("Subagent process has no PID");
      // Nobody else can know a new task's file before its `run` entry exists.
      lease ??= await WriterLease.acquire(start.sessionFile, [process.pid, pid]);
      this.lifetime.signal.throwIfAborted();
      usageStart = start.usageStart;
      const startedAt = Date.now();
      const entry: RunRecord = {
        task_id: taskId,
        run_id: runId,
        previous_run_id: resumed?.record.run_id ?? null,
        session_file: start.sessionFile,
        session_id: start.sessionId,
        description,
        model,
        thinking,
        background: details.background,
        started_at: startedAt
      };
      this.options.append(RUN_ENTRY, entry);
      details.task_id = taskId;
      record = startRun(entry, this.parent, resumed?.record, {
        model: start.model ?? model,
        thinking: start.thinking,
        stats: start.usageStart
      });
      started = record;
      details.model = boundedText(record.model);
      details.thinking = boundedText(record.thinking);
      this.remember(record);
      this.live.set(taskId, task);
      // Readers observe the run before its prompt is sent.
      this.emit({ kind: "run", record, run });
      // The record must reach every ancestor before this child can request capacity.
      this.publish(taskId, true);
      if (start.interrupted) this.warn(INTERRUPTED_WARNING);
      change();
      this.changed(taskId);
    };

    const run = new ChildRun({
      invocation: this.options.invocation,
      cwd: launch.cwd,
      depth,
      model,
      thinking,
      trusted: launch.trusted,
      ...(launch.parentSession === undefined ? {} : { parentSession: launch.parentSession }),
      prompt: request.prompt,
      streamingBehavior: request.delivery === "steer" ? "steer" : "followUp",
      ...(this.options.extension === undefined ? {} : { extension: this.options.extension }),
      ...(resumed
        ? {
            sessionFile: resumed.record.session_file,
            sessionId: resumed.record.session_id
          }
        : { sessionName: description }),
      taskId,
      runId,
      previousRunId: resumed?.record.run_id ?? null,
      // A descendant needs its full EOF/TERM/KILL interval before its supervisor
      // can be forced down. Capacity also bounds the number of possible levels.
      shutdownGraceMs: Math.min(
        2_147_483_647,
        STOP_GRACE_MS +
          Math.max(0, Math.min(this.config.maxDepth, this.config.maxConcurrent) - depth) *
            (STOP_GRACE_MS + KILL_GRACE_MS)
      ),
      onSpawn: async (pid) => {
        await resumed?.lease.add(pid);
      },
      onActivity: (activity) => {
        if (this.closed) return;
        details.activity = activity;
        change();
        this.changed(details.task_id);
      },
      onStart: (start) => {
        starting = begin(start);

        return starting;
      },
      onEvent: (event) => {
        if (this.closed || record?.state !== "active") return;
        const next = applyEvent(record, event);

        if (next !== record) {
          record = next;
          details.model = boundedText(record.model);
          details.thinking = boundedText(record.thinking);
          this.remember(record);
        }

        this.event(record.task_id, event);
      },
      onUIRequest: (ui) => this.dialog(run, ui, () => onUIRequest(ui, description, dialogs.signal))
    });
    run.listen((message) => {
      if (!this.closed) this.relay.receive(taskId, message);
    });
    const task: ManagedTask = {
      run,
      details,
      background: promotion.promise,
      promote: () => {
        if (this.closed || details.background || !this.processes.has(task)) return;
        details.background = true;

        if (record?.state === "active") {
          record = promoteRun(record);
          this.remember(record);
          this.publish(taskId, true);
        }

        promotion.resolve();
        this.changed(details.task_id);
      },
      done: run.done.then(async (result) => {
        dialogs.abort();
        await starting.catch(() => {});
        details.state = result.outcome;
        details.ended_at = Date.now();
        const usage =
          usageStart && result.usageEnd
            ? detailsUsage(usageDifference(usageStart, result.usageEnd))
            : undefined;
        details.usage = usage ?? detailsUsage();
        let finished: TaskRecord | undefined;

        if (record?.state === "active" && started) {
          const end = endRecord(record, result, usage, details.ended_at);
          finished = endRun(started, end);

          try {
            this.options.append(END_ENTRY, end);
          } catch {
            /* Without `end`, the branch shows this run as cancelled. */
          }
        }

        // A same-process resume must not find this run's lease after it sees the task inactive.
        await lease?.release().catch(() => {});

        if (finished) {
          record = finished;
          this.remember(finished);
          this.live.delete(taskId);
          this.relay.exited(taskId);

          for (const descendant of this.records.values()) {
            if (descendant.state === "active" && this.belongsTo(taskId, descendant.task_id)) {
              this.remember(stopRun(descendant));
              this.publish(descendant.task_id, true);
            }
          }

          this.publish(taskId, true);
          this.changed(taskId);
        }

        this.processes.delete(task);
        reservation.release();
        const late = lateUsage(task.reported, result.usageEnd, details.model);
        this.emit({
          kind: "completed",
          details: { ...details },
          text: result.text,
          outcome: result.outcome,
          ...(late ? { lateUsage: late } : {}),
          dropped: task.drop === true && result.outcome === "cancelled"
        });

        return result;
      })
    };
    this.processes.add(task);
    if (details.background) promotion.resolve();

    return task;
  }

  /** A foreground call waits for the result; a background or promoted call returns once started. */
  private async returned(task: ManagedTask): Promise<Submission> {
    const started = await task.run.started;
    const interrupted = started?.interrupted ?? false;
    const result = started
      ? await Promise.race([task.done, task.background.then(() => undefined)])
      : await task.done;

    if (!result && started) {
      const stats = await task.run.stats();
      // Without stats the call reports no usage, so all run usage arrives with the result.
      task.reported = stats ?? started.usageStart;
      const usage = stats ? usageDifference(started.usageStart, stats) : undefined;

      return {
        kind: "background",
        details: {
          ...task.details,
          state: "running",
          // The call has returned; a fixed end keeps its card from claiming live progress.
          ended_at: Date.now(),
          returned: "background",
          background: true,
          usage: detailsUsage(usage)
        },
        usage,
        interrupted
      };
    }

    const final = result ?? (await task.done);
    const usage =
      final.usageStart && final.usageEnd
        ? usageDifference(final.usageStart, final.usageEnd)
        : undefined;

    return {
      kind: "result",
      details: { ...task.details, usage: detailsUsage(usage) },
      text: final.text,
      usage,
      interrupted
    };
  }

  /** Send a child's dialog answer to the child. A failed dialog dismisses the request. */
  private dialog(
    run: ChildRun,
    request: RpcExtensionUIRequest,
    answer: () => Promise<RpcExtensionUIResponse | undefined>
  ): void {
    if (this.closed) return;
    void answer()
      .then((response) => {
        if (!this.closed && response) return run.connection.respond(response);
      })
      .catch(() => {
        if (this.closed) return;
        void run.connection
          .respond({ type: "extension_ui_response", id: request.id, cancelled: true })
          .catch(() => {});
      });
  }

  private event(taskId: string, event: JsonAgentSessionEvent): void {
    if (this.closed) return;
    if (
      event.type !== "message_end" &&
      event.type !== "agent_settled" &&
      event.type !== "thinking_level_changed"
    )
      return;
    this.changed(taskId);
    this.publish(taskId);
  }

  private send(message: ChildMessage): void {
    if (!this.options.send) throw new Error("Subagent supervisor is unavailable");
    this.options.send(message);
  }

  /** In a child, send a task's current record to the supervisor; a run's start and end send at once. */
  private publish(taskId: string, immediate = false): void {
    if (this.parent === null || this.closed) return;

    const flush = () => {
      this.updates.delete(taskId);
      const record = this.records.get(taskId);
      if (this.closed || !record) return;

      try {
        this.send({ kind: "task", record });
      } catch {
        /* An update must not interrupt process cleanup. */
      }
    };

    if (immediate) {
      clearTimeout(this.updates.get(taskId));
      flush();
    } else if (!this.updates.has(taskId))
      this.updates.set(taskId, setTimeout(flush, UPDATE_DEBOUNCE_MS));
  }

  /** Send a slot reply to the direct child process that runs a task. */
  private async reply(child: string, message: SlotReply): Promise<void> {
    const task = this.live.get(child);
    if (!task || !(await task.run.command("slot", message)))
      throw new Error("Subagent process has exited");
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

  /**
   * Cancel an active task of this subtree. With `drop`, a direct task's cancellation result goes
   * to nobody; a task that finished before the abort keeps its result.
   */
  async abort(
    taskId: string,
    { reason = "Cancelled by user", drop = false }: { reason?: string; drop?: boolean } = {}
  ): Promise<Aborted> {
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
      if (!reply?.record) throw new Error("Task is inactive");
      if (reply.record.state !== "inactive" || reply.record.outcome !== "cancelled")
        throw new Error("Invalid subagent abort acknowledgement");
      record = reply.record;
    } else {
      if (drop) task.drop = true;
      void task.run.cancel(reason);
      const result = await task.done;
      record = this.owned(taskId);
      // Process exit can precede managed-task cleanup, leaving an already finished run in live.
      if (result.outcome !== "cancelled") throw new Error("Task is inactive");
    }

    if (record.state !== "inactive" || record.outcome !== "cancelled")
      throw new Error("Task is inactive");

    return {
      record: { ...record, outcome: record.outcome },
      ...(task ? { details: task.details } : {})
    };
  }

  async background(taskId?: string): Promise<TaskRecord[]> {
    if (taskId === undefined) {
      if (this.options.depth !== 0) throw new Error("A task ID is required in a child supervisor");
      for (const task of this.processes) task.promote();

      return this.list().filter((record) => this.live.has(record.task_id));
    }

    return [await this.promote(taskId)];
  }

  /** Move one active foreground task of this subtree to the background. */
  private async promote(taskId: string): Promise<TaskRecord> {
    const record = this.owned(taskId);
    if (record.state !== "active") throw new Error("Task is inactive");
    if (record.background) throw new Error("Task is already in the background");
    const task = this.live.get(taskId);

    if (task) {
      task.promote();

      return this.owned(taskId);
    }

    const reply = await requestControl(this.route(taskId).run, {
      kind: "background",
      task_id: taskId
    });
    this.lifetime.signal.throwIfAborted();
    if (!reply?.record) throw new Error("Task is inactive");

    return reply.record;
  }

  invalidate(): void {
    this.closed = true;
    this.lifetime.abort();
    this.capacity.shutdown();
    this.relay.invalidate();
    for (const timer of this.updates.values()) clearTimeout(timer);
    this.updates.clear();
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
    this.listeners.clear();
  }

  owned(taskId: string): TaskRecord {
    if (this.closed) throw new Error("Subagent session ended");
    const record = this.list().find((record) => record.task_id === taskId);
    if (!record) throw new Error("Task does not belong to this session");

    return record;
  }

  private remember(record: TaskRecord): void {
    this.read.delete(record.task_id);
    this.records.set(record.task_id, record);
  }
}
