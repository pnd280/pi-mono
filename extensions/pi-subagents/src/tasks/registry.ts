import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { ResultSource, taskResultMessage } from "../background-result.ts";
import type { PiInvocation } from "../child/invocation.ts";
import { forwardStderr } from "../child/platform.ts";
import type { SubagentsConfig } from "../config.ts";
import { STOP_FAILURE_PREFIX } from "../constants.ts";
import {
  errorText,
  type ChildMessage,
  type Control,
  type SlotReply
} from "../coordination/protocol.ts";
import { Relay } from "../coordination/relay.ts";
import type { RunConnection } from "../history/reader.ts";
import type { ToolDetails } from "../result.ts";
import type { TaskRecord } from "./records.ts";
import { Route, type Cancelled } from "./route.ts";
import {
  Run,
  type CallHandlers,
  type DialogHandler,
  type LaunchContext,
  type RunHost,
  type RunReport,
  type RunReturn,
  type Selection
} from "./run.ts";
import type { ToolInput } from "./tool-schema.ts";
import { TaskTree } from "./tree.ts";

export type TaskEvent =
  | { kind: "changed"; taskId?: string }
  /** A direct task's run began; its child is not yet prompted. */
  | { kind: "run"; record: TaskRecord; run: RunConnection };

export const INTERRUPTED_WARNING =
  "The resumed history ends with an incomplete tool cycle. Old calls are not replayed automatically. Completed effects remain; the model can request the operation again.";

/** What a `subagent` call sets; the launch context supplies the other values. */
export type SubmitRequest = ToolInput;

/** The result of one call; the caller formats it. */
export type Submission =
  /** Input reached an active task, and the call returns at once. */
  { kind: "input"; details: ToolDetails } | RunReturn;

/** Process-owned children and branch-owned history; neither depends on terminal mounting. */
export class Tasks {
  private readonly relay: Relay;
  /** The parent of this supervisor's direct tasks: its own task ID in a child. */
  private readonly parent: string | null;
  /** The tasks of this binding's subtree; this binding's runs and the relay feed it. */
  readonly tree: TaskTree;
  private lifetime = new AbortController();
  /** What this binding's runs share. */
  private readonly host: RunHost;
  /** Direct tasks whose run began and has not ended. */
  private readonly live = new Map<string, Run>();
  /** Input, abort, and promotion for the active tasks of this subtree. */
  private readonly route: Route;
  /** Direct tasks' runs whose child was spawned and has not ended. */
  private processes = new Set<Run>();
  private claimed = new Set<string>();
  private listeners = new Set<(event: TaskEvent) => void>();
  private closed = false;
  /**
   * The background results of direct tasks. An active direct background task holds the run (ADR
   * 0001); a stopped binding keeps its last records, so it holds nothing.
   */
  readonly results = new ResultSource(
    () =>
      !this.closed &&
      this.tree.direct().some((record) => record.state === "active" && record.background)
  );
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
    // Each change reaches observers, and a live record also this process's supervisor.
    this.tree = new TaskTree(entries, this.parent, ({ taskId, publish }) => {
      this.changed(taskId);
      if (publish) this.relay.publish(publish.record, publish.urgency);
    });
    this.relay = new Relay(
      {
        self: this.parent ?? undefined,
        send: (message) => this.send(message),
        reply: async (child, message) => this.reply(child, message)
      },
      this.tree,
      { maxConcurrent: config.maxConcurrent, maxQueued: config.maxQueued }
    );
    this.host = {
      config,
      depth: options.depth,
      invocation: options.invocation,
      ...(options.extension === undefined ? {} : { extension: options.extension }),
      bindingId: this.bindingId,
      parent: this.parent,
      lifetime: this.lifetime.signal,
      capacity: this.relay,
      owned: (taskId) => this.owned(taskId),
      append: (type, data) => this.options.append(type, data),
      report: (run, report) => this.report(run, report)
    };
    this.route = new Route({
      bindingId: this.bindingId,
      lifetime: this.lifetime.signal,
      live: this.live,
      owned: (taskId) => this.owned(taskId),
      belongsTo: (parent, taskId) => this.tree.belongsTo(parent, taskId)
    });
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
  async submit(request: SubmitRequest, handlers: CallHandlers): Promise<Submission> {
    if (handlers.signal?.aborted) throw new Error("Cancelled by turn abort");

    if (request.task_id !== undefined) {
      const delivery = request.delivery ?? "follow_up";
      const details = await this.route.input(request.task_id, request.prompt, delivery);
      // Without details, the task is inactive or its run ended before input reached it.
      if (details) return { kind: "input", details };
    }

    const selection = this.selection(request);
    const unclaim = this.claim(request.task_id);

    try {
      return await Run.launch(this.host, { ...handlers, request, selection });
    } finally {
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

  /**
   * The receiving half of the route: answer input, abort, or promotion from this process's
   * supervisor for a task of this subtree through this process's own route. Input that reaches no
   * run resumes a direct task in the background.
   */
  async control(value: Control, onUIRequest: DialogHandler): Promise<void> {
    let reply: ChildMessage;

    try {
      if (this.closed) throw new Error("Subagent session ended");

      if (value.kind === "abort") {
        // The supervisor makes its own details from the record, with its own binding ID.
        const { record } = await this.route.cancel(value.task_id, value.reason, { drop: false });
        reply = { kind: "control-reply", request_id: value.request_id, record };
      } else if (value.kind === "background") {
        const record = await this.route.promote(value.task_id);
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

  /** Apply a report of a direct task's run to the tree, the relay, and observers. */
  private report(run: Run, report: RunReport): void {
    const { taskId } = run;

    switch (report.kind) {
      case "spawned":
        this.processes.add(run);
        break;
      case "message":
        if (!this.closed) this.relay.receive(taskId, report.message);
        break;
      case "began":
        this.live.set(taskId, run);
        // The record must reach every ancestor before this child can request capacity: the run
        // prompts its child only after this report returns.
        this.tree.update(report.record, "immediate");
        // Readers observe the run before its prompt is sent.
        this.emit({ kind: "run", record: report.record, run: run.child });
        if (report.interrupted) this.warn(INTERRUPTED_WARNING);
        break;
      case "changed":
        this.changed(run.details.task_id);
        break;
      case "event":
        this.tree.update(report.record, "debounced");
        break;
      case "promoted":
        if (report.record) this.tree.update(report.record, "immediate");
        else this.changed(run.details.task_id);
        break;
      case "ended":
        if (report.record) {
          this.live.delete(taskId);
          this.relay.exited(taskId);
          this.tree.end(report.record);
        }

        this.processes.delete(run);
        break;

      case "completed": {
        const { completion } = report;
        if (this.closed) break;
        // A call that ended with its run returned the result itself, and a dropped result goes
        // to nobody. Either can change whether the run is held. The supervisor stops tasks at a
        // session change.
        this.results.publish(
          completion.callReturned && !completion.dropped
            ? { kind: "result", message: taskResultMessage(completion), survivesChange: false }
            : { kind: "changed" }
        );
      }
    }
  }

  private send(message: ChildMessage): void {
    if (!this.options.send) throw new Error("Subagent supervisor is unavailable");
    this.options.send(message);
  }

  /** Send a slot reply to the direct child process that runs a task. */
  private async reply(child: string, message: SlotReply): Promise<void> {
    const run = this.live.get(child);
    if (!run || !(await run.child.command("slot", message)))
      throw new Error("Subagent process has exited");
  }

  /**
   * Cancel an active task of this subtree. With `drop`, a direct task's cancellation result goes
   * to nobody; a task that finished before the abort keeps its result. A failed cleanup of the
   * task's processes throws after the task stops.
   */
  abort(
    taskId: string,
    { reason = "Cancelled by user", drop = false }: { reason?: string; drop?: boolean } = {}
  ): Promise<Cancelled> {
    return this.route.cancel(taskId, reason, { drop });
  }

  async background(taskId?: string): Promise<TaskRecord[]> {
    if (taskId === undefined) {
      if (this.options.depth !== 0) throw new Error("A task ID is required in a child supervisor");
      for (const run of this.processes) run.promote();

      return this.tree.list().filter((record) => this.live.has(record.task_id));
    }

    return [await this.route.promote(taskId)];
  }

  invalidate(): void {
    this.closed = true;
    this.lifetime.abort(new Error("Subagent session ended"));
    this.relay.invalidate();
    this.tree.close();
  }

  /**
   * Stops every run and settles after each run ended. The binding is invalid, so no result reports
   * a failed cleanup of a run's processes; the stop rejects with them after all runs ended.
   */
  async shutdown(immediate = false): Promise<void> {
    this.invalidate();
    const runs = [...this.processes];

    for (const run of runs) {
      if (immediate) void run.terminate("Cancelled by session navigation");
      else void run.cancel("Cancelled by session shutdown");
    }

    const failures = await Promise.all(
      runs.map(async (run) => {
        const { stopError } = await run.done;

        return stopError ? [`task ${run.details.task_id}: ${stopError}`] : [];
      })
    );
    this.relay.shutdown();
    this.listeners.clear();
    const failed = failures.flat();
    if (!failed.length) return;

    // Pi catches session_shutdown errors. The supervisor of this child supervisor reads the
    // failures from its stderr. Each record starts a line, also after other output without a
    // final newline.
    if (this.options.depth > 0)
      await forwardStderr(failed.map((failure) => `\n${STOP_FAILURE_PREFIX}${failure}\n`).join(""));
    throw new Error(`Task cleanup failed: ${failed.join("; ")}`);
  }

  /** The current record of a task of this subtree; it throws after the binding ends. */
  owned(taskId: string): TaskRecord {
    if (this.closed) throw new Error("Subagent session ended");

    return this.tree.owned(taskId);
  }
}
