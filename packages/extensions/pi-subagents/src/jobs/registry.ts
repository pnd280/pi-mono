import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { constants, homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBashToolDefinition,
  DEFAULT_MAX_BYTES,
  type BashOperations,
  type ExtensionToolContext,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

import { jobResultMessage, ResultSource } from "../background-result.ts";
import { getDepth } from "../child/depth.ts";
import { forwardStderr, killGroupSync } from "../child/platform.ts";
import { JOB_END_ENTRY, JOB_ENTRY, STOP_FAILURE_PREFIX } from "../constants.ts";
import { boundedText, firstLine } from "../result.ts";
import { JobLog } from "./log-writer.ts";
import { formatLogTail } from "./log.ts";
import { jobOperations } from "./process.ts";
import {
  jobHistory,
  stoppedJob,
  type JobDetails,
  type JobEndEntry,
  type JobEntry,
  type JobInput,
  type JobRecord
} from "./records.ts";

export type JobEvent = { kind: "changed"; jobId: string };

/** Job log files are `<prefix><job_id>.log` in the OS temporary directory. */
const JOB_LOG_PREFIX = "pi-job-";

/** Stop a noisy job before a slow log writer can exhaust the supervisor's memory. */
const MAX_PENDING_LOG_BYTES = 16 * 1024 * 1024;

/** The shell settings that Pi's own `bash` applies. */
export type ShellOptions = { shellPath?: string; commandPrefix?: string };

type LiveJob = {
  controller: AbortController;
  log: JobLog;
  output: Buffer;
  clipped: boolean;
  stopError?: Error;
  /** `job_abort` asked for the job's result to be dropped if the job is cancelled. */
  drop: boolean;
  /** The model asked with `hold_run` that the job holds the run until it ends; see ADR 0008. */
  hold: boolean;
  /** The first log write error; it fails the job. */
  writeError?: Error;
  done: Promise<JobRecord>;
};

type Ended = {
  outcome: JobEndEntry["outcome"];
  exit_code: number | null;
  error?: string;
  /** Pi's text already states the error, so the result adds no `Error:` line. */
  stated?: true;
};

/** Pi converts these Git Bash, MSYS, Cygwin, and WSL drive paths on Windows. */
function windowsShellPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return path;
  const match = /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i.exec(path);
  if (!match?.[1]) return path;

  return `${match[1].toUpperCase()}:\\${match[2]?.replaceAll("/", "\\") ?? ""}`;
}

/**
 * Pi's raw `shellPath` and `shellCommandPrefix` settings, as Pi's settings manager resolves them:
 * the path expands `~` and `file://`; the prefix is unchanged.
 */
export function shellOptions(
  settings: { shellPath?: unknown; shellCommandPrefix?: unknown },
  home = homedir()
): ShellOptions {
  const { shellPath, shellCommandPrefix } = settings;
  let path = typeof shellPath === "string" && shellPath ? shellPath : undefined;
  if (path && process.platform === "win32") path = windowsShellPath(path);
  if (path) path = expandHomePath(path, home);
  if (path?.startsWith("file://")) path = fileURLToPath(path);

  return {
    ...(path ? { shellPath: path } : {}),
    ...(typeof shellCommandPrefix === "string" && shellCommandPrefix
      ? { commandPrefix: shellCommandPrefix }
      : {})
  };
}

/** Names the signal of a shell's `128 + signal` exit code; the command can also exit so itself. */
function exitSignal(code: number): string | undefined {
  return code > 128
    ? Object.entries(constants.signals).find(([, number]) => number === code - 128)?.[0]
    : undefined;
}

const exitSchema = z.object({ exit_code: z.number() });

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const TIMEOUT = /Command timed out after (\S+) seconds$/;

const ABORTED = /Command aborted$/;

/** A log write error fails the job, whatever the command did. */
function writeFailure(live: Omit<LiveJob, "done">, exit_code: number | null): Ended | undefined {
  return live.writeError
    ? { outcome: "failed", exit_code, error: `Log file write failed: ${live.writeError.message}` }
    : undefined;
}

/** The outcome of a command that exited with `code`. */
function exited(live: Omit<LiveJob, "done">, code: number): Ended {
  if (code === 0) return writeFailure(live, 0) ?? { outcome: "completed", exit_code: 0 };
  const signal = exitSignal(code);

  // Pi's text ends with "Command exited with code <code>"; only a signal name adds to it.
  return (
    writeFailure(live, code) ??
    (signal
      ? { outcome: "failed", exit_code: code, error: `exit code ${code} (${signal})` }
      : { outcome: "failed", exit_code: code, error: `exit code ${code}`, stated: true })
  );
}

/** Pi's terminal status precedes a later abort during process-group cleanup. */
function thrown(live: Omit<LiveJob, "done">, text: string): Ended {
  const failure = writeFailure(live, null);
  if (failure) return failure;
  const timeout = TIMEOUT.exec(text)?.[1];
  if (timeout)
    return {
      outcome: "failed",
      exit_code: null,
      error: `timed out after ${timeout} s`,
      stated: true
    };
  if (ABORTED.test(text))
    return { outcome: "cancelled", exit_code: null, error: "Cancelled", stated: true };
  const line = firstLine(text);

  return line
    ? { outcome: "failed", exit_code: null, error: line, stated: true }
    : { outcome: "failed", exit_code: null, error: "Job failed" };
}

/**
 * Background shell commands of one supervisor binding. Each live job owns its shell and group
 * through cleanup, as well as its abort controller, bounded log, entries, and outcome.
 */
export class Jobs {
  private records: Map<string, JobRecord>;
  private live = new Map<string, LiveJob>();
  private processes = new Set<ChildProcess>();
  private killOnExit = () => {
    for (const child of this.processes) {
      try {
        killGroupSync(child);
      } catch {
        // Exit cannot wait or retry. One failed kill must not prevent the other attempts.
      }
    }
  };
  /** Log streams that have not closed, including streams that never started a job. */
  private streams = new Set<Promise<void>>();
  private listeners = new Set<(event: JobEvent) => void>();
  private closed = false;
  /** The results of exited jobs. A live job started with `hold_run` holds the run; see ADR 0008. */
  readonly results = new ResultSource(
    () => !this.closed && [...this.live.values()].some((job) => job.hold)
  );
  readonly bindingId: string;

  get activeBinding(): boolean {
    return !this.closed;
  }

  constructor(
    entries: readonly SessionEntry[],
    private options: ShellOptions & {
      sessionId: string;
      cwd: string;
      /** The selected ancestry now; it can move before this binding ends. */
      branch(): readonly SessionEntry[];
      append(type: string, data: unknown): void;
      warn?(message: string): void;
      /** A job was accepted: its log file is open and its entry is appended. */
      started?(): void;
    }
  ) {
    this.bindingId = options.sessionId;
    this.records = jobHistory(entries);
  }

  list(): JobRecord[] {
    return [...this.records.values()];
  }

  owned(jobId: string): JobRecord {
    if (this.closed) throw new Error("Job session ended");
    const record = this.records.get(jobId);
    // The registry knows only the jobs on the selected ancestry.
    if (!record) throw new Error("Unknown job");

    return record;
  }

  details<T extends JobRecord>(record: T): T & { binding_id: string } {
    return { ...record, binding_id: this.bindingId };
  }

  subscribe(listener: (event: JobEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: JobEvent): void {
    if (this.closed) return;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* Observers cannot change process lifetime. */
      }
    }
  }

  /** Opens the job's log file, then starts the command without waiting for it. */
  async start(input: JobInput, ctx: ExtensionToolContext): Promise<JobDetails> {
    if (this.closed) throw new Error("Job session ended");
    const job_id = randomUUID();
    const log_file = join(tmpdir(), `${JOB_LOG_PREFIX}${job_id}.log`);
    // Like Pi's output files: never follow a planted link, and keep the output private.
    const log = new JobLog(log_file);
    const controller = new AbortController();
    const live: Omit<LiveJob, "done"> = {
      controller,
      log,
      drop: false,
      hold: input.hold_run === true,
      output: Buffer.alloc(0),
      clipped: false
    };
    // An unhandled stream error would end Pi; a write error after the start fails the job.
    log.on("error", (error) => {
      live.writeError ??= error;
      controller.abort();
    });
    const closed = new Promise<void>((resolve) => log.once("close", resolve));
    this.streams.add(closed);
    void closed.then(() => this.streams.delete(closed));

    try {
      await once(log, "open");
    } catch (error) {
      throw new Error(`Job log file could not be opened: ${errorText(error)}`);
    }

    // The binding can end while the file opens.
    if (!this.activeBinding) {
      log.end();
      throw new Error("Job session ended");
    }

    const entry: JobEntry = {
      job_id,
      description: boundedText(input.description),
      command: boundedText(input.command),
      log_file,
      started_at: Date.now()
    };
    const record: JobRecord = { ...entry, state: "active", exit_code: null, ended_at: null };

    try {
      this.options.append(JOB_ENTRY, entry);
    } catch (error) {
      // Pi keeps the entry in memory, where it shows the job as cancelled; no command starts.
      this.records.set(job_id, stoppedJob(entry));
      log.end();
      this.emit({ kind: "changed", jobId: job_id });
      throw new Error(`Job entry could not be saved: ${errorText(error)}`);
    }

    this.records.set(job_id, record);
    this.options.started?.();
    // One object: `abort` marks the same job that `run` reads.
    this.live.set(job_id, Object.assign(live, { done: this.run(record, live, input, ctx) }));
    this.emit({ kind: "changed", jobId: job_id });

    return this.details(record);
  }

  /** One exit listener covers all owned groups; log closure can continue after they are released. */
  private trackProcess(child: ChildProcess): () => void {
    if (!this.processes.size) process.on("exit", this.killOnExit);
    this.processes.add(child);

    return () => {
      this.processes.delete(child);
      if (!this.processes.size) process.off("exit", this.killOnExit);
    };
  }

  /** Keep output out of Pi's accumulator: it would create a second, unbounded disk log. */
  private operations(live: Omit<LiveJob, "done">): BashOperations {
    return jobOperations(
      this.options.shellPath,
      (data) => {
        if (live.writeError || live.log.destroyed || live.log.writableEnded) return;

        if (live.log.writableLength + data.length > MAX_PENDING_LOG_BYTES) {
          live.writeError = new Error("Pending log output exceeded 16 MiB");
          live.controller.abort();
          // Discard the stalled queue so completion does not wait for it to drain.
          live.log.destroy(live.writeError);

          return;
        }

        live.log.write(data);
        const output = Buffer.concat([live.output, data]);
        live.clipped ||= output.length > DEFAULT_MAX_BYTES;
        live.output = output.subarray(-DEFAULT_MAX_BYTES);
      },
      (error) => (live.stopError ??= error),
      (child) => this.trackProcess(child)
    );
  }

  private async run(
    record: JobRecord,
    live: Omit<LiveJob, "done">,
    input: JobInput,
    ctx: ExtensionToolContext
  ): Promise<JobRecord> {
    const { commandPrefix } = this.options;
    // The operations carry the shell path.
    const tool = createBashToolDefinition(this.options.cwd, {
      operations: this.operations(live),
      ...(commandPrefix ? { commandPrefix } : {})
    });
    let ended: Ended;
    let text: string;

    // The outcome comes from the command first; a later abort cannot change it.
    try {
      const result = await tool.execute(
        record.job_id,
        {
          command: input.command,
          ...(input.timeout === undefined ? {} : { timeout: input.timeout })
        },
        live.controller.signal,
        undefined,
        ctx
      );
      // Pi resolves only with an exit code. Its accumulator receives no job output.
      const code = exitSchema.parse(result.structuredContent).exit_code;
      ended = exited(live, code);
      text = code === 0 ? "" : `Command exited with code ${code}`;
    } catch (error) {
      text = errorText(error);
      ended = thrown(live, text);
    }

    if (!live.log.destroyed) live.log.end();
    await new Promise<void>((resolve) =>
      live.log.closed ? resolve() : live.log.once("close", () => resolve())
    );
    // The last buffered writes can fail as the log closes.
    ended = writeFailure(live, ended.exit_code) ?? ended;
    if (live.stopError)
      ended = {
        outcome: "failed",
        exit_code: ended.exit_code,
        error: [ended.error, `Job cleanup failed: ${live.stopError.message}`]
          .filter(Boolean)
          .join("; ")
      };
    const output = formatLogTail(live.output, live.clipped);
    text = [output || (text ? "" : "(no output)"), text].filter(Boolean).join("\n\n");
    this.live.delete(record.job_id);
    const ended_at = Date.now();
    const done: JobRecord & { state: "inactive" } = {
      job_id: record.job_id,
      description: record.description,
      command: record.command,
      log_file: record.log_file,
      started_at: record.started_at,
      state: "inactive",
      outcome: ended.outcome,
      exit_code: ended.exit_code,
      ended_at,
      ...(ended.error ? { error: ended.error } : {})
    };
    // A session change gives the job no end entry and no result: it shows as cancelled. An earlier
    // `session_tree` handler can run after the leaf moved and before this binding ends.
    if (this.closed || !jobHistory(this.options.branch()).has(record.job_id)) return done;
    this.records.set(record.job_id, done);
    const end: JobEndEntry = {
      job_id: done.job_id,
      outcome: done.outcome,
      exit_code: done.exit_code,
      ...(done.error ? { error: done.error } : {}),
      ended_at
    };

    try {
      this.options.append(JOB_END_ENTRY, end);
    } catch (error) {
      // Without its end entry, the job shows as cancelled after a restart; its result still arrives.
      this.options.warn?.(
        `pi-subagents: the end of job ${done.job_id} could not be saved: ${errorText(error)}`
      );
    }

    // `job_abort` gave up a cancelled job's result. A job result waits during a pending session
    // change, because a later extension can cancel the change; see ADR 0005.
    if (!live.drop || done.outcome !== "cancelled")
      this.results.publish({
        kind: "result",
        message: jobResultMessage(this.details(done), text, ended.stated === true),
        survivesChange: true
      });
    this.emit({ kind: "changed", jobId: done.job_id });

    return done;
  }

  /**
   * Cancel an active job. With `drop`, its cancellation result goes to nobody; a job that exited
   * before the abort keeps its own outcome and result.
   */
  async abort(jobId: string, { drop = false }: { drop?: boolean } = {}): Promise<JobRecord> {
    const record = this.owned(jobId);
    const live = this.live.get(jobId);
    if (record.state !== "active" || !live) throw new Error("Job is inactive");
    if (drop) live.drop = true;
    live.controller.abort();

    const done = await live.done;
    if (live.stopError) throw new Error(`Job cleanup failed: ${live.stopError.message}`);

    return done;
  }

  /** No later entry, result, or event leaves this binding. */
  invalidate(): void {
    this.closed = true;
  }

  /** Kills every job's process group and settles after each command and log file closed. */
  async shutdown(): Promise<void> {
    this.invalidate();
    const jobs = [...this.live];
    for (const [, job] of jobs) job.controller.abort();
    await Promise.all([...jobs.map(([, job]) => job.done), ...this.streams]);
    this.listeners.clear();
    const failures = jobs.flatMap(([id, job]) =>
      job.stopError ? [{ id, error: job.stopError }] : []
    );
    if (!failures.length) return;

    // Pi catches session_shutdown errors. Its supervising task needs the stderr record as well.
    if (getDepth() > 0)
      await forwardStderr(
        failures
          .map(({ id, error }) => `\n${STOP_FAILURE_PREFIX}job ${id}: ${error.message}\n`)
          .join("")
      );
    throw new AggregateError(
      failures.map(({ error }) => error),
      `Job cleanup failed: ${failures.map(({ error }) => error.message).join("; ")}`
    );
  }
}
