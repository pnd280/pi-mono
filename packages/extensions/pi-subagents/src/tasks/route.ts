import { randomUUID } from "node:crypto";

import type { ControlRequest } from "../coordination/protocol.ts";
import { detailsUsage, type ToolDetails } from "../result.ts";
import type { TaskRecord } from "./records.ts";
import type { Run } from "./run.ts";

type Delivery = "steer" | "follow_up";

/** What the route reads from its supervisor binding. */
export type RouteHost = {
  /** The binding's session ID; the abort details of a descendant carry it. */
  bindingId: string;
  /** Ends with the binding; a request that returns later fails with its reason. */
  lifetime: AbortSignal;
  /** Direct tasks whose run began and has not ended. */
  live: ReadonlyMap<string, Run>;
  /** The current record of a task of this subtree; it throws after the binding ends. */
  owned(taskId: string): TaskRecord;
  /** Whether `taskId` is `parent` or one of its descendants. */
  belongsTo(parent: string, taskId: string): boolean;
};

/** A task that an abort cancelled, and the details of the abort call. */
export type Cancelled = {
  record: TaskRecord & { state: "inactive"; outcome: "cancelled" };
  details: ToolDetails;
};

/** The answer to one request. A routed child's `control-reply` has the same fields. */
type Answer = {
  details?: ToolDetails | undefined;
  record?: TaskRecord | undefined;
  error?: string | undefined;
};

/**
 * One way to reach an active task. A request gives undefined when it did not reach the task:
 * nothing was sent, or the task ended first.
 */
type Target = {
  /** The run that carries the task: its own run, or the run of the direct task above it. */
  run: Run;
  input(prompt: string, delivery: Delivery): Promise<Answer | undefined>;
  cancel(reason: string, drop: boolean): Promise<Answer | undefined>;
  promote(): Promise<Answer | undefined>;
};

/** A direct task, reached through its own run. */
function local(host: RouteHost, run: Run): Target {
  return {
    run,
    async input(prompt, delivery) {
      return (await run.input(prompt, delivery))
        ? { details: { ...run.details, delivery } }
        : undefined;
    },
    async cancel(reason, drop) {
      const end = await run.cancel(reason, { drop });
      // Process exit can precede the run's cleanup, leaving an already finished run in `live`.
      if (end.outcome !== "cancelled") return undefined;

      return {
        record: host.owned(run.taskId),
        details: { ...run.details },
        // The task stopped, but its processes can still run, so the abort did not succeed.
        ...(end.stopError
          ? { error: `Task cancelled, but owned-process cleanup failed: ${end.stopError}` }
          : {})
      };
    },
    async promote() {
      run.promote();

      return { record: host.owned(run.taskId) };
    }
  };
}

/**
 * A descendant, reached through the child of the direct task above it. That child supervisor
 * answers through its own route; see `Tasks.control`.
 */
function routed(run: Run, taskId: string): Target {
  const request = (value: ControlRequest): Promise<Answer | undefined> => {
    const request_id = randomUUID();

    return run.child.ask("control", { ...value, request_id }, (message) =>
      message.kind === "control-reply" && message.request_id === request_id ? message : undefined
    );
  };

  return {
    run,
    input: (prompt, delivery) => request({ kind: "input", task_id: taskId, prompt, delivery }),
    // A descendant's result goes to its own supervisor, so this supervisor has no result to drop.
    cancel: (reason) => request({ kind: "abort", task_id: taskId, reason }),
    promote: () => request({ kind: "background", task_id: taskId })
  };
}

/** A descendant's abort details. This supervisor has no call of the task, so the record gives them. */
function recordDetails(bindingId: string, record: TaskRecord): Omit<ToolDetails, "state"> {
  return {
    task_id: record.task_id,
    binding_id: bindingId,
    description: record.description,
    model: record.model,
    thinking: record.thinking,
    background: record.background,
    delivery: "follow_up",
    started_at: record.started_at,
    ended_at: record.ended_at ?? null,
    activity: "",
    usage: record.usage ?? detailsUsage()
  };
}

/**
 * The live route from a supervisor to the active tasks of its subtree. A direct task is reached
 * through its own run. A descendant is reached through the run of the direct task above it, whose
 * child supervisor answers the request for its own subtree.
 */
export class Route {
  constructor(private readonly host: RouteHost) {}

  /**
   * Send input to an active task. Undefined when the task is inactive, or when nothing was sent;
   * the run that carried the task has then ended, so the caller can resume a direct task.
   */
  async input(
    taskId: string,
    prompt: string,
    delivery: Delivery
  ): Promise<ToolDetails | undefined> {
    const target = this.target(taskId);
    if (!target) return undefined;
    const answer = await this.answer(target.input(prompt, delivery));

    if (!answer) {
      await target.run.done;

      return undefined;
    }

    if (!answer.details) throw new Error("Subagent input acknowledgement is missing its result");
    // An input call's details describe that call, which returns at once. A routed child's
    // details carry its own binding; the card opens in this one.
    const now = Date.now();

    return {
      ...answer.details,
      binding_id: this.host.bindingId,
      state: "running",
      started_at: now,
      ended_at: now,
      returned: "input",
      usage: detailsUsage()
    };
  }

  /**
   * Cancel an active task. With `drop`, a direct task's cancellation result goes to nobody; a task
   * that finished before the abort keeps its result. A failed cleanup of the task's processes
   * throws after the task stops.
   */
  async cancel(taskId: string, reason: string, { drop }: { drop: boolean }): Promise<Cancelled> {
    const target = this.target(taskId);
    if (!target) throw new Error("Task is inactive");
    const answer = await this.answer(target.cancel(reason, drop));
    if (!answer) throw new Error("Task is inactive");
    const { record } = answer;
    if (record?.task_id !== taskId || record.state !== "inactive" || record.outcome !== "cancelled")
      throw new Error("Invalid subagent abort acknowledgement");
    const details: ToolDetails = {
      ...(answer.details ?? recordDetails(this.host.bindingId, record)),
      state: record.outcome
    };
    details.ended_at ??= Date.now();

    return { record: { ...record, outcome: record.outcome }, details };
  }

  /** Move an active task's foreground work to the background. */
  async promote(taskId: string): Promise<TaskRecord> {
    const target = this.target(taskId);
    if (!target) throw new Error("Task is inactive");
    if (this.host.owned(taskId).background) throw new Error("Task is already in the background");
    const answer = await this.answer(target.promote());
    if (!answer) throw new Error("Task is inactive");
    if (answer.record?.task_id !== taskId)
      throw new Error("Invalid subagent background acknowledgement");

    return answer.record;
  }

  /** The target of a task of this subtree; undefined when the task is inactive. */
  private target(taskId: string): Target | undefined {
    const { host } = this;
    if (host.owned(taskId).state !== "active") return undefined;
    const run = host.live.get(taskId);
    if (run) return local(host, run);
    for (const [id, owner] of host.live)
      if (host.belongsTo(id, taskId)) return routed(owner, taskId);
    throw new Error("Task is inactive");
  }

  /** A target's answer. After the binding ends, no answer counts; an answer's error throws. */
  private async answer(pending: Promise<Answer | undefined>): Promise<Answer | undefined> {
    const answer = await pending;
    this.host.lifetime.throwIfAborted();
    if (answer?.error) throw new Error(answer.error);

    return answer;
  }
}
