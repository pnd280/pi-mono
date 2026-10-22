import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { SubagentsConfig } from "./config.ts";
import type { Delivery } from "./delivery.ts";
import { RunReader } from "./history/reader.ts";
import { Jobs } from "./jobs/registry.ts";
import { Panels } from "./task-panel/panels.ts";
import { Tasks } from "./tasks/registry.ts";
import { taskWidget } from "./widget.ts";

type TasksOptions = ConstructorParameters<typeof Tasks>[2];

type JobsOptions = ConstructorParameters<typeof Jobs>[1];

/**
 * What a binding uses of the Pi session that opens it. The adapter reads it from the context of
 * the event that opens the binding.
 */
export type BindingSession = {
  config: SubagentsConfig;
  /** The selected ancestry now. */
  branch(): readonly SessionEntry[];
  tasks: Omit<TasksOptions, "append" | "warn">;
  jobs: Omit<JobsOptions, "branch" | "append" | "warn">;
  /** Writes of the binding's tasks and jobs; the binding passes on only those of current ones. */
  append(type: string, data: unknown): void;
  warn(message: string): void;
  /** Delivers the background results of the binding; the binding adds its sources and stops it. */
  delivery: Delivery;
  /** Shows the panel and the widget. */
  ui: Pick<ExtensionContext, "mode" | "ui">;
};

/** The tasks, jobs, and views of a binding, until a session change stops the tasks. */
export type Bound = {
  readonly tasks: Tasks;
  readonly jobs: Jobs;
  readonly reader: RunReader;
  readonly panels: Panels;
};

type Opened = {
  readonly session: BindingSession;
  readonly jobs: Jobs;
  /** Unset while a session change stops the tasks, and after a cancelled change until they reopen. */
  bound: Bound | undefined;
  /** Removes the bound tasks' results from delivery. */
  release: () => void;
  /**
   * The stop of the tasks that the latest session change stopped. It never rejects: the caller that
   * stopped them reports a failed cleanup.
   */
  stopped: Promise<void>;
  widget: { dispose(): void };
};

/**
 * The leaf that Pi selects for a tree navigation to `targetId`: the parent of a user or custom
 * message, otherwise the target.
 */
export function navigationLeaf(target: SessionEntry | undefined, targetId: string): string | null {
  return (target?.type === "message" && target.message.role === "user") ||
    target?.type === "custom_message"
    ? target.parentId
    : targetId;
}

/**
 * The supervisor's session binding: its tasks, jobs, delivery, and views for one session and
 * selected ancestry. Transitions run one at a time, in the order of their calls.
 *
 * - `open` binds to a session at its start, and to the new ancestry when a navigation is final. An
 *   open binding stops first.
 * - `beforeChange` stops the tasks before a navigation, fork, or switch. Jobs keep running and
 *   their results wait, because a later extension can still cancel the change; see ADR 0005.
 * - `current` gives the open tasks and views. Pi emits no event when a change is cancelled, so
 *   after a change that stopped the tasks, the next interaction reopens them on the current branch.
 * - `revoke` starts the session's end synchronously: the binding opens and gives nothing, and its
 *   tasks, jobs, and delivery start, write, and deliver nothing. Pi does not use an extension
 *   instance after its shutdown, so a revoked binding stays revoked.
 * - `close` stops the tasks, jobs, delivery, and views when the session ends.
 *
 * A transition that stops tasks or jobs rejects after the stops end when a cleanup of their
 * processes failed, so Pi reports the failure as an error of the event's handler.
 */
export class SessionBinding {
  private opened: Opened | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private revoked = false;

  /** The delivery of the open binding; it is also open while a session change is pending. */
  get delivery(): Delivery | undefined {
    return this.opened?.session.delivery;
  }

  /** The only check of whether `part` belongs to the open binding: stopped parts write nothing. */
  isCurrent(part: Tasks | Jobs | Bound | undefined): boolean {
    const opened = this.opened;
    if (this.revoked || !opened || !part) return false;

    return part === opened.jobs || part === opened.bound || part === opened.bound?.tasks;
  }

  private run<T>(transition: () => Promise<T>): Promise<T> {
    const result = this.queue.then(transition);
    this.queue = result.catch(() => {});

    return result;
  }

  open(session: BindingSession): Promise<void> {
    return this.run(async () => {
      if (this.revoked) return;
      await this.stop(true);
      const jobs: Jobs = new Jobs(session.branch(), {
        ...session.jobs,
        branch: () => session.branch(),
        append: (type, data) => {
          if (this.isCurrent(jobs)) session.append(type, data);
        },
        warn: (message) => {
          if (this.isCurrent(jobs)) session.warn(message);
        }
      });
      const opened: Opened = {
        session,
        jobs,
        bound: undefined,
        release: () => {},
        stopped: Promise.resolve(),
        widget: { dispose() {} }
      };
      session.delivery.add(jobs.results);
      this.opened = opened;
      await this.openTasks(opened);
    });
  }

  beforeChange(): Promise<void> {
    return this.run(async () => {
      const opened = this.opened;
      if (!opened?.bound) return;
      const stopped = this.stopTasks(opened, true);
      opened.session.delivery.suspend();
      this.showWidget(opened, undefined);
      await stopped;
    });
  }

  /** The open tasks and views, or `undefined` without a session. */
  current(): Promise<Bound | undefined> {
    return this.run(() => this.reopen());
  }

  /** A run starts: the job results that waited during a cancelled change join it. */
  runStarted(): Promise<void> {
    return this.run(async () => {
      await this.reopen();
      this.opened?.session.delivery.resume();
    });
  }

  /**
   * Opens the tasks again after a change that stopped them. If the change is still in progress,
   * such as during a branch summary, its final event stops them again.
   */
  private async reopen(): Promise<Bound | undefined> {
    const opened = this.opened;
    if (!opened || opened.bound) return this.revoked ? undefined : opened?.bound;
    await opened.stopped;
    if (this.revoked) return;

    return this.openTasks(opened);
  }

  /** Runs before any participant's shutdown work awaits; `close` then stops what it blocked. */
  revoke(): void {
    this.revoked = true;
    const opened = this.opened;
    if (!opened) return;
    opened.jobs.invalidate();
    opened.bound?.tasks.invalidate();
    opened.session.delivery.shutdown();
  }

  close(immediate: boolean): Promise<void> {
    return this.run(() => this.stop(immediate));
  }

  private async stop(immediate: boolean): Promise<void> {
    const opened = this.opened;
    if (!opened) return;
    this.opened = undefined;
    // No end entry or result of a stopped job reaches the next ancestry.
    opened.jobs.invalidate();
    const tasksStopped = this.stopTasks(opened, immediate);
    const jobsStopped = opened.jobs.shutdown();
    opened.session.delivery.shutdown();
    opened.widget.dispose();
    // Attach both handlers now: job cleanup can fail while task cleanup is still waiting.
    const stopped = await Promise.allSettled([tasksStopped, jobsStopped]);
    const failures = stopped.flatMap((result): unknown[] =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (failures.length)
      throw new AggregateError(
        failures,
        failures.map((error) => (error instanceof Error ? error.message : String(error))).join("; ")
      );
  }

  private async openTasks(opened: Opened): Promise<Bound> {
    const { session, jobs } = opened;
    const tasks: Tasks = new Tasks(session.config, session.branch(), {
      ...session.tasks,
      append: (type, data) => {
        if (this.isCurrent(tasks)) session.append(type, data);
      },
      warn: (message) => {
        if (this.isCurrent(tasks)) session.warn(message);
      }
    });
    const reader = new RunReader(tasks);
    await tasks.tree.refresh();
    const bound: Bound = {
      tasks,
      jobs,
      reader,
      panels: new Panels(tasks, jobs, reader, session.ui)
    };
    opened.bound = bound;
    opened.release = session.delivery.add(tasks.results);
    this.showWidget(opened, tasks);

    return bound;
  }

  /**
   * Runs that a change stops stay cancelled: the stopped tasks append no end entry. Only the
   * returned stop of the bound tasks rejects with a failed cleanup, so it is reported once.
   */
  private stopTasks(opened: Opened, immediate: boolean): Promise<void> {
    const { bound } = opened;
    if (!bound) return opened.stopped;
    opened.bound = undefined;
    const stopped = bound.tasks.shutdown(immediate);
    opened.stopped = stopped.catch(() => {});
    opened.release();
    bound.reader.dispose();
    bound.panels.dispose();

    return stopped;
  }

  /** Without `tasks`, while a session change stops them, the widget counts only jobs. */
  private showWidget(opened: Opened, tasks: Tasks | undefined): void {
    opened.widget.dispose();
    opened.widget = taskWidget(tasks, opened.jobs, opened.session.ui, () => {
      void this.current()
        .then((bound) => bound?.panels.open())
        .catch(() => {});
    });
  }
}
