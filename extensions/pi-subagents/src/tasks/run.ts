import { randomUUID } from "node:crypto";

import type { Usage } from "@earendil-works/pi-ai";
import type {
  JsonAgentSessionEvent,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  SessionStats
} from "@earendil-works/pi-coding-agent";

import { lateUsage, type LateUsage } from "../background-result.ts";
import type { PiInvocation } from "../child/invocation.ts";
import type * as ChildModule from "../child/run.ts";
import type { ChildResult, ChildRun, ChildStart } from "../child/run.ts";
import type { SubagentsConfig } from "../config.ts";
import { END_ENTRY, KILL_GRACE_MS, RUN_ENTRY, STOP_GRACE_MS } from "../constants.ts";
import type { ChildMessage } from "../coordination/protocol.ts";
import type { Reservation } from "../coordination/relay.ts";
import { WriterLease } from "../history/lease.ts";
import { checkSession } from "../history/sessions.ts";
import { boundedText, detailsUsage, usageDifference, type ToolDetails } from "../result.ts";
import {
  applyEvent,
  endRecord,
  endRun,
  startRun,
  type RunRecord,
  type TaskRecord
} from "./records.ts";
import type { ToolInput } from "./tool-schema.ts";

// Process machinery loads at the first launch, not at startup. Concurrent launches share one
// import, because Pi's loader can return a module that is still evaluating.
let child: Promise<typeof ChildModule> | undefined;
const loadChild = () => (child ??= import("../child/run.ts"));

/** The supervisor's current selection and environment, read at each launch. */
export type LaunchContext = {
  /** The current model as `provider/id`; without one, a new task must name a model. */
  model: string | undefined;
  thinking: string;
  cwd: string;
  trusted: boolean;
  parentSession: string | undefined;
};

/** A call's model and thinking level, and the launch context they came from. */
export type Selection = { launch: LaunchContext; model: string; thinking: string };

/** Ask the user a child's dialog; no response means that the request needs no answer. */
export type DialogHandler = (
  request: RpcExtensionUIRequest,
  description: string,
  signal: AbortSignal
) => Promise<RpcExtensionUIResponse | undefined>;

export type CallHandlers = {
  /** A turn abort: it ends a wait for capacity and terminates the run until the call returns. */
  signal?: AbortSignal;
  /** The call's current details, while the call is open. */
  onChange?(details: ToolDetails): void;
  /** The dialogs of the started run, also after a background call returns. */
  onUIRequest: DialogHandler;
};

/**
 * One call that launches a run of a task that the caller claimed. With `request.task_id`, the run
 * resumes that inactive direct task.
 */
export type RunCall = CallHandlers & { request: ToolInput; selection: Selection };

/** What a launch call returns; the caller formats it. */
export type RunReturn =
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

/** A run's completion: a fixed snapshot of its call and result. */
export type RunCompletion = {
  details: ToolDetails;
  text: string;
  outcome: ChildResult["outcome"];
  /** Usage after a background or promoted call returned. */
  lateUsage?: LateUsage;
  /** `subagent_abort` cancelled the task, so its result goes to nobody. */
  dropped: boolean;
  /** The call returned while the run continued; only then is the result a background result. */
  callReturned: boolean;
};

/** How a run ended; `stopError` names a failed stop of its processes, which can still run. */
export type RunEnd = RunCompletion & { stopError?: string };

/** The run's own call also reads the child's result. */
type Ended = RunEnd & { result: ChildResult };

/** What a run reports to its host, in lifecycle order. */
export type RunReport =
  /** The child was spawned. */
  | { kind: "spawned" }
  /** A coordination message from the begun child. */
  | { kind: "message"; message: ChildMessage }
  /** The run's `run` entry exists, and its child is not yet prompted. */
  | { kind: "began"; record: TaskRecord; interrupted: boolean }
  /** The run's details changed. */
  | { kind: "changed" }
  /** A child event changed what observers show; `record` is the run's live record. */
  | { kind: "event"; record: TaskRecord }
  /** The run moved to the background; `record` is the changed live record. */
  | { kind: "promoted"; record?: TaskRecord }
  /**
   * The child and any forced stop of its process group are gone, the `end` entry exists, and the
   * writer lease is released; the capacity slot is still held. `record` is a begun run's final
   * record.
   */
  | { kind: "ended"; record?: TaskRecord }
  /** The capacity slot is released. */
  | { kind: "completed"; completion: RunCompletion };

/** What every run of one supervisor binding shares. */
export type RunHost = {
  config: Pick<SubagentsConfig, "maxDepth" | "maxConcurrent">;
  /** This supervisor's depth; its children run one level below it. */
  depth: number;
  invocation: PiInvocation;
  /** This process's `subagents` extension entry, when Pi loaded it from a file. */
  extension?: string;
  bindingId: string;
  /** The parent of this supervisor's direct tasks: its own task ID in a child. */
  parent: string | null;
  /** Ends with the binding: a launch then fails, and a run stops reporting changes. */
  lifetime: AbortSignal;
  /** Whole-tree capacity; a run holds one slot. */
  capacity: { acquire(signal?: AbortSignal): Promise<Reservation> };
  /** The current record of a task of this subtree; it throws after the binding ends. */
  owned(taskId: string): TaskRecord;
  /** Append an entry to the supervisor session. */
  append(type: string, data: unknown): void;
  report(run: Run, report: RunReport): void;
};

/** An inactive direct task whose child file this process now holds the writer lease for. */
type Resumed = { record: TaskRecord; lease: WriterLease };

function queuedDetails(request: ToolInput, { model, thinking }: Selection): ToolDetails {
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
function failure(details: ToolDetails, error: unknown, aborted: boolean): RunReturn {
  return {
    kind: "result",
    details: { ...details, state: aborted ? "cancelled" : "failed", ended_at: Date.now() },
    text: error instanceof Error ? error.message : "Subagent call failed",
    usage: undefined,
    interrupted: false
  };
}

/** Take the writer lease of a claimed direct task, then check its child file under the lease. */
async function resume(host: RunHost, taskId: string | undefined): Promise<Resumed | undefined> {
  if (taskId === undefined) return;
  const record = host.owned(taskId);
  const lease = await WriterLease.acquire(record.session_file, [process.pid]);

  try {
    await checkSession(record);
    host.lifetime.throwIfAborted();
  } catch (error) {
    await lease.release().catch(() => {});
    throw error;
  }

  return { record, lease };
}

/**
 * One run of a claimed task, from launch to exit. It keeps the order of the run lifecycle in ADR
 * 0003:
 *
 * 1. reserve a capacity slot;
 * 2. for a resume, take the writer lease, then check the child file;
 * 3. spawn the child and begin the run;
 * 4. for a new task, take the writer lease of the reported file; append `run`, then prompt;
 * 5. wait for the child's exit and for any forced stop of its process group;
 * 6. append `end`;
 * 7. release the writer lease;
 * 8. release the capacity slot.
 *
 * A launch that spawns no child releases the lease and the slot that it took.
 */
export class Run {
  /** A new task's ID is fixed before its child starts. */
  readonly taskId: string;
  /** The child process; coordination requests and transcript readers use its connection. */
  readonly child: ChildRun;
  /** The details of the call that started the run; they change while the run is active. */
  readonly details: ToolDetails;
  private readonly runId = randomUUID();
  private readonly previous: TaskRecord | undefined;
  private lease: WriterLease | undefined;
  private readonly ended: Promise<Ended>;
  /** The live record while the run is active. */
  private record: TaskRecord | undefined;
  /** The record from this run's start; its `end` adds to the usage of earlier runs. */
  private started: TaskRecord | undefined;
  /** Statistics after `begin`; `end` counts this run's usage from here. */
  private usageStart: SessionStats | undefined;
  private starting: Promise<void> = Promise.resolve();
  /** Resolves when the run is in the background, from launch or after promotion. */
  private promotion = Promise.withResolvers<void>();
  private dialogs = new AbortController();
  /** Child stats when a background or promoted call returned; its returned usage ends here. */
  private reported: SessionStats | undefined;
  /** `subagent_abort` cancelled the run; its cancellation result goes to nobody. */
  private drop = false;
  /** The call returned while the run continues; set before the run's end can report it. */
  private callReturned = false;
  /** Only the release of the capacity slot and the completion remain. */
  private finished = false;

  /**
   * Launch or resume a claimed task for one call. A foreground call returns the run's result; a
   * background or promoted call returns when its run starts. Failures return as a result.
   */
  static async launch(host: RunHost, call: RunCall): Promise<RunReturn> {
    const { signal } = call;
    let open = true;
    let reservation: Reservation | undefined;
    let resumed: Resumed | undefined;
    let run: Run | undefined;
    let details = queuedDetails(call.request, call.selection);

    const change = () => {
      if (!open || host.lifetime.aborted) return;

      // A presentation callback must not throw out of a child event or leak the running process.
      try {
        call.onChange?.(details);
      } catch {
        /* The final result still carries the latest details. */
      }
    };

    // A background call also waits until its child starts; until then, the abort ends the run.
    const abort = () => {
      if (run && !run.callReturned) void run.terminate("Cancelled by turn abort");
    };

    try {
      change();
      const { ChildRun } = await loadChild();
      reservation = await host.capacity.acquire(signal);
      if (signal?.aborted) throw new Error("Cancelled by turn abort");
      resumed = await resume(host, call.request.task_id);
      if (signal?.aborted) throw new Error("Cancelled by turn abort");
      details = { ...details, state: "running", started_at: Date.now() };
      run = new Run(ChildRun, host, call, reservation, resumed, change);
      details = run.details;
      change();
      signal?.addEventListener("abort", abort, { once: true });

      return await run.returned();
    } catch (error) {
      if (run && !run.callReturned) await run.child.cancel("Cancelled after subagent call failure");

      return failure(details, error, signal?.aborted ?? false);
    } finally {
      open = false;
      signal?.removeEventListener("abort", abort);

      // A call that started no run returns the lease and capacity it took.
      if (!run) {
        await resumed?.lease.release().catch(() => {});
        reservation?.release();
      }
    }
  }

  private constructor(
    Child: typeof ChildRun,
    private readonly host: RunHost,
    private readonly call: RunCall,
    private readonly reservation: Reservation,
    resumed: Resumed | undefined,
    /** Report the call's details while the call is open. */
    private readonly change: () => void
  ) {
    if (host.lifetime.aborted) throw new Error("Subagent session ended");
    const {
      request,
      selection: { launch, model, thinking }
    } = call;
    const depth = host.depth + 1;
    this.previous = resumed?.record;
    this.lease = resumed?.lease;
    this.taskId = resumed?.record.task_id ?? randomUUID();
    this.details = {
      binding_id: host.bindingId,
      description: boundedText(request.description),
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
    this.child = new Child({
      invocation: host.invocation,
      cwd: launch.cwd,
      depth,
      model,
      thinking,
      trusted: launch.trusted,
      ...(launch.parentSession === undefined ? {} : { parentSession: launch.parentSession }),
      prompt: request.prompt,
      streamingBehavior: request.delivery === "steer" ? "steer" : "followUp",
      ...(host.extension === undefined ? {} : { extension: host.extension }),
      ...(resumed
        ? { sessionFile: resumed.record.session_file, sessionId: resumed.record.session_id }
        : { sessionName: request.description }),
      taskId: this.taskId,
      runId: this.runId,
      previousRunId: resumed?.record.run_id ?? null,
      // A descendant needs its full EOF/TERM/KILL interval before its supervisor
      // can be forced down. Capacity also bounds the number of possible levels.
      shutdownGraceMs: Math.min(
        2_147_483_647,
        STOP_GRACE_MS +
          Math.max(0, Math.min(host.config.maxDepth, host.config.maxConcurrent) - depth) *
            (STOP_GRACE_MS + KILL_GRACE_MS)
      ),
      onSpawn: async (pid) => {
        await resumed?.lease.add(pid);
      },
      onActivity: (activity) => this.activity(activity),
      onStart: (start) => {
        this.starting = this.begin(start);

        return this.starting;
      },
      onEvent: (event) => this.event(event),
      onUIRequest: (request) => this.dialog(request)
    });
    this.child.listen((message) => host.report(this, { kind: "message", message }));
    this.ended = this.child.done.then((result) => this.end(result));
    host.report(this, { kind: "spawned" });
    if (this.details.background) this.promotion.resolve();
  }

  /** Resolves after the run released its writer lease and capacity slot. */
  get done(): Promise<RunEnd> {
    return this.ended;
  }

  /** Move the run to the background; a call that waits for its result returns. */
  promote(): void {
    if (this.host.lifetime.aborted || this.details.background || this.finished) return;
    this.details.background = true;
    let record: TaskRecord | undefined;

    if (this.record?.state === "active") {
      this.record = { ...this.record, background: true };
      record = this.record;
    }

    this.promotion.resolve();
    this.host.report(this, { kind: "promoted", ...(record ? { record } : {}) });
  }

  /** Send input to the child; false when the child was closing and nothing was sent. */
  async input(prompt: string, delivery: ToolDetails["delivery"]): Promise<boolean> {
    return Boolean(await this.child.input(prompt, delivery === "steer" ? "steer" : "followUp"));
  }

  /** Request a graceful stop. With `drop`, the run's cancellation result goes to nobody. */
  cancel(reason: string, { drop = false }: { drop?: boolean } = {}): Promise<RunEnd> {
    if (drop) this.drop = true;
    void this.child.cancel(reason);

    return this.done;
  }

  /** Stop the child's owned process tree at once. */
  terminate(reason: string): Promise<RunEnd> {
    void this.child.terminate(reason);

    return this.done;
  }

  /** A foreground call waits for the result; a background or promoted call returns once started. */
  private async returned(): Promise<RunReturn> {
    const started = await this.child.started;
    const interrupted = started?.interrupted ?? false;
    const ended = started
      ? await Promise.race([this.ended, this.promotion.promise.then(() => undefined)])
      : await this.ended;

    if (!ended && started) {
      this.callReturned = true;
      const stats = await this.child.stats();
      // Without stats the call reports no usage, so all run usage arrives with the result.
      this.reported = stats ?? started.usageStart;
      const usage = stats ? usageDifference(started.usageStart, stats) : undefined;

      return {
        kind: "background",
        details: {
          ...this.details,
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

    const { result } = ended ?? (await this.ended);
    const usage =
      result.usageStart && result.usageEnd
        ? usageDifference(result.usageStart, result.usageEnd)
        : undefined;

    return {
      kind: "result",
      details: { ...this.details, usage: detailsUsage(usage) },
      text: result.text,
      usage,
      interrupted
    };
  }

  /** The child acknowledged `begin`: take a new task's lease, then record the run's start. */
  private async begin(start: ChildStart): Promise<void> {
    const { host, details } = this;
    const pid = this.child.connection.process.pid;
    if (pid === undefined) throw new Error("Subagent process has no PID");
    // Nobody else can know a new task's file before its `run` entry exists.
    this.lease ??= await WriterLease.acquire(start.sessionFile, [process.pid, pid]);
    host.lifetime.throwIfAborted();
    this.usageStart = start.usageStart;
    const {
      request: { description },
      selection: { model, thinking }
    } = this.call;
    const entry: RunRecord = {
      task_id: this.taskId,
      run_id: this.runId,
      previous_run_id: this.previous?.run_id ?? null,
      session_file: start.sessionFile,
      session_id: start.sessionId,
      description,
      model,
      thinking,
      background: details.background,
      started_at: Date.now()
    };
    host.append(RUN_ENTRY, entry);
    details.task_id = this.taskId;
    const record = startRun(entry, host.parent, this.previous, {
      model: start.model ?? model,
      thinking: start.thinking,
      stats: start.usageStart
    });
    this.record = record;
    this.started = record;
    details.model = boundedText(record.model);
    details.thinking = boundedText(record.thinking);
    host.report(this, { kind: "began", record, interrupted: start.interrupted });
    this.change();
    host.report(this, { kind: "changed" });
  }

  private activity(activity: string): void {
    if (this.host.lifetime.aborted) return;
    this.details.activity = activity;
    this.change();
    this.host.report(this, { kind: "changed" });
  }

  private event(event: JsonAgentSessionEvent): void {
    const { record } = this;
    if (this.host.lifetime.aborted || record?.state !== "active") return;
    // Only these events change the record or what observers show.
    if (
      event.type !== "message_end" &&
      event.type !== "agent_settled" &&
      event.type !== "thinking_level_changed" &&
      event.type !== "compaction_end"
    )
      return;
    const next = applyEvent(record, event);

    if (next !== record) {
      this.record = next;
      this.details.model = boundedText(next.model);
      this.details.thinking = boundedText(next.thinking);
    }

    this.host.report(this, { kind: "event", record: next });
  }

  /** Send a child's dialog answer to the child. A failed dialog dismisses the request. */
  private dialog(request: RpcExtensionUIRequest): void {
    const { lifetime } = this.host;
    if (lifetime.aborted) return;
    void this.call
      .onUIRequest(request, this.call.request.description, this.dialogs.signal)
      .then((response) => {
        if (!lifetime.aborted && response) return this.child.connection.respond(response);
      })
      .catch(() => {
        if (lifetime.aborted) return;
        void this.child.connection
          .respond({ type: "extension_ui_response", id: request.id, cancelled: true })
          .catch(() => {});
      });
  }

  /** Steps 6 to 8: the child and any forced stop of its process group are gone. */
  private async end(result: ChildResult): Promise<Ended> {
    const { host, details } = this;
    this.dialogs.abort();
    await this.starting.catch(() => {});
    details.state = result.outcome;
    details.ended_at = Date.now();
    const usage =
      this.usageStart && result.usageEnd
        ? detailsUsage(usageDifference(this.usageStart, result.usageEnd))
        : undefined;
    details.usage = usage ?? detailsUsage();
    let finished: TaskRecord | undefined;

    if (this.record?.state === "active" && this.started) {
      const end = endRecord(this.record, result, usage, details.ended_at);
      finished = endRun(this.started, end);

      try {
        host.append(END_ENTRY, end);
      } catch {
        /* Without `end`, the branch shows this run as cancelled. */
      }
    }

    // A same-process resume must not find this run's lease after it sees the task inactive.
    await this.lease?.release().catch(() => {});
    if (finished) this.record = finished;
    this.finished = true;
    host.report(this, { kind: "ended", ...(finished ? { record: finished } : {}) });
    this.reservation.release();
    const late = lateUsage(this.reported, result.usageEnd, details.model);
    const completion: RunCompletion = {
      details: { ...details },
      text: result.text,
      outcome: result.outcome,
      ...(late ? { lateUsage: late } : {}),
      dropped: this.drop && result.outcome === "cancelled",
      callReturned: this.callReturned
    };
    host.report(this, { kind: "completed", completion });

    return {
      ...completion,
      ...(result.stopError === undefined ? {} : { stopError: result.stopError }),
      result
    };
  }
}
