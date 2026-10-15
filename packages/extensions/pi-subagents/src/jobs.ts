import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream, type WriteStream } from "node:fs";
import { constants, homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { contentText } from "@earendil-works/pi-ai";
import {
  createBashToolDefinition,
  createLocalBashOperations,
  type BashOperations,
  type ExtensionToolContext,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

import { JOB_END_ENTRY, JOB_ENTRY, JOB_LOG_PREFIX } from "./constants.ts";
import {
  jobHistory,
  stoppedJob,
  type JobDetails,
  type JobEndEntry,
  type JobEntry,
  type JobInput,
  type JobRecord
} from "./job-records.ts";
import { boundedText, firstLine } from "./result.ts";

export type JobEvent =
  | { kind: "changed"; jobId: string }
  /** A job's command exited. `text` is the bounded output tail and the reason. */
  | {
      kind: "completed";
      details: JobDetails & { state: "inactive" };
      text: string;
      /** `job_abort` cancelled the job, so its result goes to nobody. */
      dropped: boolean;
    };

/** The shell settings that Pi's own `bash` applies. */
export type ShellOptions = { shellPath?: string; commandPrefix?: string };

type LiveJob = {
  controller: AbortController;
  log: WriteStream;
  /** `job_abort` asked for the job's result to be dropped if the job is cancelled. */
  drop: boolean;
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

/** Pi throws for an abort, a timeout, or a start failure; the text holds the output and reason. */
function thrown(live: Omit<LiveJob, "done">, text: string): Ended {
  const failure = writeFailure(live, null);
  if (failure) return failure;
  // A timeout can stop the command just before the abort; then Pi's text names only the timeout.
  if (live.controller.signal.aborted)
    return {
      outcome: "cancelled",
      exit_code: null,
      error: "Cancelled",
      ...(ABORTED.test(text) ? { stated: true as const } : {})
    };
  const timeout = TIMEOUT.exec(text)?.[1];
  if (timeout)
    return {
      outcome: "failed",
      exit_code: null,
      error: `timed out after ${timeout} s`,
      stated: true
    };
  const line = firstLine(text);

  return line
    ? { outcome: "failed", exit_code: null, error: line, stated: true }
    : { outcome: "failed", exit_code: null, error: "Job failed" };
}

/**
 * Background shell commands of one supervisor binding. Pi's own `bash` runs each command in its
 * process group; this registry owns the job's abort controller, log file, entries, and outcome.
 */
export class Jobs {
  private records: Map<string, JobRecord>;
  private live = new Map<string, LiveJob>();
  /** Log streams that have not closed, including streams that never started a job. */
  private streams = new Set<Promise<void>>();
  private listeners = new Set<(event: JobEvent) => void>();
  private closed = false;
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
    const log = createWriteStream(log_file, { flags: "wx", mode: 0o600 });
    const controller = new AbortController();
    const live: Omit<LiveJob, "done"> = { controller, log, drop: false };
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

  /** Pi's local shell, with each output chunk also written to the job's log file. */
  private operations(live: Omit<LiveJob, "done">): BashOperations {
    const local = createLocalBashOperations(
      this.options.shellPath ? { shellPath: this.options.shellPath } : undefined
    );

    return {
      exec: (command, cwd, options) =>
        local.exec(command, cwd, {
          ...options,
          onData: (data) => {
            options.onData(data);
            // The stream buffers without backpressure; a destroyed stream already failed the job.
            if (!live.log.destroyed && !live.log.writableEnded) live.log.write(data);
          }
        })
    };
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
      text = contentText(result.content, "");
      // Pi resolves only with an exit code.
      ended = exited(live, exitSchema.parse(result.structuredContent).exit_code);
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

    this.emit({
      kind: "completed",
      details: this.details(done),
      // Pi gives details only to the UI; the model learns the reason from this text.
      text: [
        // Pi keeps the output's final newline; the join adds the blank line.
        text.trimEnd(),
        !ended.stated && done.error && `Error: ${done.error}`,
        `Log file: ${done.log_file}`
      ]
        .filter(Boolean)
        .join("\n\n"),
      dropped: live.drop && done.outcome === "cancelled"
    });

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

    return live.done;
  }

  /** No later entry, result, or event leaves this binding. */
  invalidate(): void {
    this.closed = true;
  }

  /** Kills every job's process group and settles after each command and log file closed. */
  async shutdown(): Promise<void> {
    this.invalidate();
    const jobs = [...this.live.values()];
    for (const job of jobs) job.controller.abort();
    await Promise.all([...jobs.map((job) => job.done), ...this.streams]);
    this.listeners.clear();
  }
}
