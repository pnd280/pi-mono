import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { setTimeout as delay } from "node:timers/promises";

import { contentText, type AssistantMessage } from "@earendil-works/pi-ai";
import {
  truncateHead,
  type JsonAgentSessionEvent,
  type RpcCommand,
  type RpcExtensionUIRequest,
  type RpcResponse,
  type RpcSessionState,
  type SessionStats
} from "@earendil-works/pi-coding-agent";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import {
  DEPTH_ENV,
  PROTOCOL_KEY,
  PROTOCOL_VERSION,
  STOP_FAILURE_PREFIX,
  STOP_GRACE_MS,
  TASK_ID_ENV
} from "../constants.ts";
import { childMessageSchema, decode, encode, type ChildMessage } from "../coordination/protocol.ts";
import { firstLine } from "../result.ts";
import { ChildConnection, type ProcessExit, type RpcRecord } from "./connection.ts";
import { childArgs, type ChildSelection, type PiInvocation } from "./invocation.ts";
import {
  forceStop,
  isAlive,
  processOptions,
  stopRemainingGroup,
  terminateTree
} from "./platform.ts";

type Begun = Extract<ChildMessage, { kind: "begun" }>;

/** The longest cleanup failure that one stderr record of a child supervisor gives. */
const STOP_FAILURE_MAX = 4_096;

/** The longest cleanup failure that a failed run's first line gives before its other failure. */
const CLEANUP_SUMMARY_MAX = 256;

/** The interval of checks for output after a stop; each check follows a poll for input. */
const OUTPUT_CHECK_MS = 10;

/** Checks without data after which the supervisor closes output pipes that another process holds. */
const OUTPUT_IDLE_CHECKS = 10;

/** How long the supervisor reads output after a stop before it closes the pipes anyway. */
const OUTPUT_DRAIN_MS = 2_000;

/** Starts the result of a run whose output pipes the supervisor closed before EOF. */
const OUTPUT_INCOMPLETE = "Output can be incomplete: the supervisor closed it before EOF";

export type ChildStart = {
  taskId: string;
  runId: string;
  sessionId: string;
  sessionFile: string;
  /** The continued history ends with a tool call that has no result. */
  interrupted: boolean;
  /** The model and thinking level that the child applied after Pi resolved and clamped the selection. */
  model?: string;
  thinking: string;
  /** Statistics after `begin`; Pi's totals also cover the file's earlier runs. */
  usageStart: SessionStats;
};

export type ChildResult = {
  outcome: "completed" | "failed" | "cancelled";
  text: string;
  usageStart?: SessionStats;
  usageEnd?: SessionStats;
  exit: ProcessExit;
  /** A stop of the child's processes failed, so they can still run; the text names it. */
  stopError?: string;
};

export type ChildOptions = ChildSelection & {
  invocation: PiInvocation;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  depth: number;
  shutdownGraceMs?: number;
  parentSession?: string;
  /** Display name for a new child session. */
  sessionName?: string;
  prompt: string;
  streamingBehavior?: "steer" | "followUp";
  taskId: string;
  runId: string;
  /** The run to continue, with `sessionFile`; null for a new task. */
  previousRunId: string | null;
  /** The session identity that a resumed file must have. */
  sessionId?: string;
  onSpawn?: (pid: number) => Promise<void>;
  onStart?: (start: ChildStart) => void | Promise<void>;
  /** The child's latest top-level tool, cleared when its agent starts and when the run exits. */
  onActivity?: (activity: string) => void;
  onEvent?: (event: JsonAgentSessionEvent) => void;
  onUIRequest?: (request: RpcExtensionUIRequest) => void;
};

/** One process lifetime, including the wait for exit after EOF or cancellation. */
export class ChildRun {
  private ready = Promise.withResolvers<ChildStart | undefined>();
  readonly started = this.ready.promise;
  readonly connection: ChildConnection;
  readonly done: Promise<ChildResult>;
  private start: ChildStart | undefined;
  /** The child acknowledged this run's `begin`; only then does it exchange other messages. */
  private begun = false;
  /** Requests that wait for their reply; each takes the first message that it matches. */
  private replies = new Set<(message: ChildMessage) => boolean>();
  private usageEnd: SessionStats | undefined;
  private lastAssistant: AssistantMessage | undefined;
  /** The latest final reply that no input has followed yet. */
  private reply = "";
  /** Final replies that later input in this run followed; the result keeps them in order. */
  private earlier: string[] = [];
  private text = "";
  private activity = "";
  private step = "spawn";
  private failure: { step: string; message: string } | undefined;
  /** A failed stop of the child's processes; the result's text also names it. */
  private stopError: string | undefined;
  /** The supervisor closed the output pipes before EOF, so later records can be missing. */
  private outputIncomplete = false;
  private cancellation: string | undefined;
  private initialised = false;
  private agentEnded = true;
  private settled = false;
  private epoch = 0;
  private collecting = false;
  private closing = false;
  private inputClosed = false;
  private stopping = false;
  private finished = false;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The forced stop, or after the child's exit, the stop of its remaining process group. It ends
   * when the group is gone or its failure was reported.
   */
  private forced: Promise<void> | undefined;
  private listeners = new Set<(message: ChildMessage) => void>();

  constructor(private readonly options: ChildOptions) {
    const child = spawn(
      options.invocation.command,
      [...options.invocation.args, ...childArgs(options)],
      {
        cwd: options.cwd,
        env: {
          ...(options.env ?? process.env),
          [DEPTH_ENV]: String(options.depth),
          [TASK_ID_ENV]: options.taskId
        },
        ...processOptions(),
        stdio: "pipe",
        shell: false
      }
    );
    this.connection = new ChildConnection(child);
    this.connection.subscribe((record) => this.observe(record));
    this.connection.onDrain(() => this.scheduleCollection());
    this.connection.onError((error) => this.fail(error));
    this.readStopFailures(child.stderr);
    // A member of the child's process group can outlive the child and hold the output pipes.
    child.once("exit", () => {
      this.forced ??= stopRemainingGroup(child, (error) => this.stopFailed("force_stop", error));
      if (this.forced) void this.closeOutput(child, this.forced);
    });
    this.done = this.connection.closed.then(async (exit) => {
      this.finished = true;
      this.ready.resolve(undefined);
      clearTimeout(this.stopTimer);
      this.setActivity("");
      await this.forced;

      return this.noteOutput(this.result(exit));
    });
    void this.launch().catch((error: unknown) => this.fail(error));
  }

  get cwd(): string {
    return this.options.cwd;
  }

  /** The child's agent events, without RPC responses or dialogs. */
  events(listener: (event: JsonAgentSessionEvent) => void): () => void {
    return this.connection.subscribe((record) => {
      if (record.type !== "response" && record.type !== "extension_ui_request") listener(record);
    });
  }

  /** The child file's entries, after `since` when given, and its current leaf. */
  async entries(since?: string) {
    const response = await this.connection.request({
      type: "get_entries",
      ...(since ? { since } : {})
    });
    if (!response.success) throw new Error(response.error);
    if (response.command !== "get_entries") throw new Error("Missing child entries");

    return response.data;
  }

  cancel(reason: string): Promise<ChildResult> {
    if (!this.finished && this.cancellation === undefined) {
      this.cancellation = reason;
      this.stop();
    }

    return this.done;
  }

  /** Request immediate owned-subtree termination; done still waits for process exit. */
  terminate(reason: string): Promise<ChildResult> {
    if (!this.finished) {
      this.cancellation ??= reason;
      this.closing = true;
      clearTimeout(this.stopTimer);
      terminateTree(this.connection.process, (error) => this.stopFailed("terminate_tree", error));
    }

    return this.done;
  }

  private async request(command: RpcCommand): Promise<Extract<RpcResponse, { success: true }>> {
    this.step = command.type;
    const response = await this.connection.request(command);
    if (!response.success) throw new Error(response.error);
    if (response.command !== command.type) throw new Error("Mismatched Pi RPC response");

    return response;
  }

  async stats(): Promise<SessionStats | undefined> {
    if (this.usageEnd) return this.usageEnd;

    try {
      const response = await this.connection.request({ type: "get_session_stats" });

      return response.success && response.command === "get_session_stats"
        ? response.data
        : undefined;
    } catch {
      return this.usageEnd;
    }
  }

  /** Claim the connection synchronously before collection can close stdin. Never retry a sent prompt. */
  async input(message: string, streamingBehavior: "steer" | "followUp") {
    if (this.closing || this.finished) return;
    this.epoch++;
    this.usageEnd = undefined;
    const response = await this.connection.request({ type: "prompt", message, streamingBehavior });
    if (!response.success) throw new Error(response.error);
    if (response.command !== "prompt") throw new Error("Mismatched child prompt response");

    return response.data.disposition;
  }

  /** Observe the coordination messages of the begun run. */
  listen(listener: (message: ChildMessage) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  /**
   * Send a reserved `/subagents` subcommand and return the child's reply; undefined when the
   * connection was closing and nothing was sent. A `handled` response is not success: Pi also
   * reports it when the command handler throws. The child writes its reply before Pi writes the
   * command's response, so a missing reply is reported, never retried.
   */
  async ask<T>(
    name: string,
    payload: unknown,
    match: (message: ChildMessage) => T | undefined
  ): Promise<T | undefined> {
    let reply: T | undefined;

    const take = (message: ChildMessage) => {
      if (reply !== undefined) return false;
      reply = match(message);

      return reply !== undefined;
    };

    this.replies.add(take);

    try {
      if (!(await this.command(name, payload))) return;
      if (reply === undefined) throw new Error(`Subagent did not acknowledge ${name}`);

      return reply;
    } finally {
      this.replies.delete(take);
    }
  }

  /**
   * Send a reserved `/subagents` subcommand that has no reply; false when the connection was
   * closing and nothing was sent. It is not input: it neither invalidates collection nor arms
   * completion, and its pending response holds stdin open.
   */
  async command(name: string, payload: unknown): Promise<boolean> {
    if (this.closing || this.finished) return false;
    const response = await this.connection.request({
      type: "prompt",
      message: `/subagents ${name} ${encode(payload)}`
    });
    if (!response.success) throw new Error(response.error);
    if (response.command !== "prompt" || response.data.disposition !== "handled")
      throw new Error("Subagent command was not handled");

    return true;
  }

  private async newSession(): Promise<void> {
    const response = await this.request({
      type: "new_session",
      ...(this.options.parentSession ? { parentSession: this.options.parentSession } : {})
    });

    if (response.command === "new_session" && response.data.cancelled) {
      throw new Error("Child cancelled new_session");
    }

    if (this.options.sessionName?.trim()) {
      await this.request({ type: "set_session_name", name: this.options.sessionName });
    }
  }

  private async begin(state: RpcSessionState): Promise<Begun> {
    const commands = await this.request({ type: "get_commands" });
    // Without the command, the begin request would reach the model as a prompt.
    if (
      commands.command !== "get_commands" ||
      !commands.data.commands.some(
        (command) => command.source === "extension" && command.name === "subagents"
      )
    )
      throw new Error("Child did not load pi-subagents");
    this.step = "begin";
    const reply = await this.ask(
      "begin",
      {
        version: PROTOCOL_VERSION,
        task_id: this.options.taskId,
        run_id: this.options.runId,
        previous_run_id: this.options.previousRunId
      },
      (message) =>
        (message.kind === "begun" || message.kind === "begin-failed") &&
        message.run_id === this.options.runId
          ? message
          : undefined
    );
    if (!reply) throw new Error("Subagent launch cancelled");
    if (reply.kind === "begin-failed") throw new Error(reply.error);
    if (
      reply.task_id !== this.options.taskId ||
      reply.session_id !== state.sessionId ||
      reply.session_file !== state.sessionFile
    )
      throw new Error("Invalid subagent begin acknowledgement");

    return reply;
  }

  private async launch(): Promise<void> {
    const pid = this.connection.process.pid;
    if (pid !== undefined) await this.options.onSpawn?.(pid);
    if (this.options.previousRunId === null) await this.newSession();

    const state = await this.request({ type: "get_state" });

    if (state.command !== "get_state" || !state.data.sessionFile) {
      throw new Error("Child has no session file");
    }

    if (this.options.sessionId !== undefined && state.data.sessionId !== this.options.sessionId)
      throw new Error("Subagent session identity does not match its task");
    const begun = await this.begin(state.data);
    if (this.closing) return;
    const usage = await this.request({ type: "get_session_stats" });
    if (usage.command !== "get_session_stats") throw new Error("Missing child usage");
    this.start = {
      taskId: this.options.taskId,
      runId: this.options.runId,
      sessionId: begun.session_id,
      sessionFile: begun.session_file,
      interrupted: begun.interrupted,
      ...(state.data.model ? { model: `${state.data.model.provider}/${state.data.model.id}` } : {}),
      thinking: state.data.thinkingLevel,
      usageStart: usage.data
    };
    this.step = "on_start";
    await this.options.onStart?.(this.start);
    if (!this.acceptingInput()) return;
    this.ready.resolve(this.start);
    const response = await this.request({
      type: "prompt",
      message: this.options.prompt,
      streamingBehavior: this.options.streamingBehavior ?? "followUp"
    });
    this.initialised = true;

    // A handled command can start its own model work. Only a command with no run
    // observed on this connection can complete without an agent_settled event.
    if (
      response.command === "prompt" &&
      response.data.disposition === "handled" &&
      this.epoch === 0
    ) {
      this.settled = true;
    }

    this.step = "agent_settled";
    this.scheduleCollection();
  }

  private acceptingInput(): boolean {
    return !this.closing && !this.finished;
  }

  private observe(record: RpcRecord): void {
    if (record.type === "response") {
      if (record.success && record.command === "prompt" && record.data.disposition === "started") {
        this.agentEnded = false;
        this.settled = false;
        this.epoch++;
      }

      return;
    }

    if (record.type === "extension_ui_request") {
      if (record.method === "setStatus" && record.statusKey === PROTOCOL_KEY) {
        const message =
          record.statusText === undefined
            ? undefined
            : decode(childMessageSchema, record.statusText);
        if (message) this.message(message);
      } else this.options.onUIRequest?.(record);

      return;
    }

    this.observeEvent(record);
    this.options.onEvent?.(record);
  }

  /**
   * A reply goes to the request that waits for it; replies that no request matches are dropped.
   * Only the begun run of this connection exchanges other coordination messages.
   */
  private message(message: ChildMessage): void {
    if (this.finished) return;

    for (const take of this.replies) {
      if (!take(message)) continue;
      if (message.kind === "begun") this.begun = true;

      return;
    }

    if (
      this.begun &&
      message.kind !== "begun" &&
      message.kind !== "begin-failed" &&
      message.kind !== "control-reply"
    )
      for (const listener of this.listeners) listener(message);
  }

  private observeEvent(event: JsonAgentSessionEvent): void {
    if (event.type === "agent_start") {
      this.agentEnded = false;
      this.settled = false;
      this.epoch++;
      this.setActivity("");
    } else if (event.type === "agent_end") {
      this.agentEnded = true;
      if (this.closing) this.statsAndClose();
    } else if (event.type === "agent_settled") {
      this.settled = true;
      this.epoch++;
    } else if (event.type === "message_end" && event.message.role === "assistant") {
      this.lastAssistant = event.message;
      // Pi's last-assistant text joins text blocks without a separator.
      this.reply =
        event.message.stopReason === "stop" ? contentText(event.message.content, "").trim() : "";
    } else if (event.type === "message_end" && event.message.role === "user") {
      // Input after a final reply continues the run, and its reply would replace that one.
      if (this.reply) this.earlier.push(this.reply);
      this.reply = "";
    } else if (event.type === "tool_execution_start" && !event.parentToolCallId) {
      // Calls that another tool made are part of that tool's activity.
      this.setActivity(
        truncateHead(compactDisplayText(event.toolName), { maxBytes: 2048, maxLines: 1 }).content
      );
    }
  }

  private setActivity(activity: string): void {
    if (activity === this.activity) return;
    this.activity = activity;
    this.options.onActivity?.(activity);
  }

  private scheduleCollection(): void {
    // Command continuations must run first, notably the initial prompt's handled disposition.
    queueMicrotask(() => {
      if (
        this.initialised &&
        this.settled &&
        !this.collecting &&
        !this.closing &&
        this.connection.pendingCount === 0
      ) {
        void this.collect().catch((error: unknown) => this.fail(error));
      }
    });
  }

  private async collect(): Promise<void> {
    this.collecting = true;
    const epoch = this.epoch;

    try {
      const text = await this.request({ type: "get_last_assistant_text" });
      const usage = await this.request({ type: "get_session_stats" });

      // A newly accepted prompt invalidates this snapshot, even if it raced the reads.
      if (
        this.settled &&
        this.epoch === epoch &&
        this.connection.pendingCount === 0 &&
        !this.closing
      ) {
        if (text.command === "get_last_assistant_text")
          this.text = [...this.earlier, text.data.text].filter(Boolean).join("\n\n");
        if (usage.command === "get_session_stats") this.usageEnd = usage.data;
        this.closeInput();
      }
    } finally {
      this.collecting = false;
      this.scheduleCollection();
    }
  }

  private fail(error: unknown): void {
    if (this.finished || this.failure || this.cancellation !== undefined) return;
    this.failure = {
      step: this.step,
      message: error instanceof Error ? error.message : String(error)
    };
    this.stop();
  }

  private stop(): void {
    this.closing = true;
    if (this.stopTimer !== undefined || this.finished) return;

    void this.connection.request({ type: "clear_queue" }).catch(() => {});
    // EOF disposes collectors. Read final statistics first, without waiting for settle hooks.
    void this.connection.request({ type: "abort" }).then(
      () => this.statsAndClose(),
      () => this.closeInput()
    );
    if (this.agentEnded) this.statsAndClose();
    this.scheduleStop();
  }

  /** A stopped run's usage counts when its statistics arrive before the stop deadline. */
  private statsAndClose(): void {
    if (this.stopping || this.inputClosed || this.finished) return;
    this.stopping = true;
    void this.connection
      .request({ type: "get_session_stats" })
      .then((response) => {
        if (response.success && response.command === "get_session_stats")
          this.usageEnd ??= response.data;
      })
      .catch(() => {})
      .finally(() => this.closeInput());
  }

  private closeInput(): void {
    this.closing = true;
    if (this.inputClosed || this.finished) return;
    this.inputClosed = true;
    this.step = "close_stdin";
    this.connection.closeInput();
    this.scheduleStop();
  }

  private scheduleStop(): void {
    if (this.stopTimer !== undefined || this.finished) return;
    // Abort, final statistics, and shutdown share one deadline, including blocked settle hooks.
    this.stopTimer = setTimeout(() => {
      if (!isAlive(this.connection.process)) return;
      this.closeInput();
      this.forced = forceStop(this.connection.process, (error) =>
        this.stopFailed("force_stop", error)
      );
    }, this.options.shutdownGraceMs ?? STOP_GRACE_MS);
  }

  /**
   * After the stop of the child's process group, EOF normally closes the output pipes. When another
   * process still holds them, the supervisor closes them once no data arrived over several checks,
   * or at the bound. Without EOF, more output could follow, so the result notes it.
   */
  private async closeOutput(
    child: ChildProcessWithoutNullStreams,
    stop: Promise<void>
  ): Promise<void> {
    let chunks = 0;

    const receive = () => {
      chunks++;
    };

    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    await stop;
    const end = Date.now() + OUTPUT_DRAIN_MS;
    let idle = 0;

    const ended = () => child.stdout.closed && child.stderr.closed;

    while (!ended() && idle < OUTPUT_IDLE_CHECKS && Date.now() < end) {
      const before = chunks;
      await delay(OUTPUT_CHECK_MS);
      idle = chunks === before ? idle + 1 : 0;
    }

    this.outputIncomplete = !ended();
    child.stdout.off("data", receive);
    child.stderr.off("data", receive);
    child.stdout.destroy();
    child.stderr.destroy();
  }

  /**
   * Records the failed process cleanups that a child supervisor writes to stderr, one per line. It
   * reads the whole stream, so other output and the bounded stderr excerpt cannot hide them.
   */
  private readStopFailures(stderr: Readable): void {
    const decoder = new StringDecoder("utf8");
    // The current line while it can still be a record.
    let line: string | undefined = "";

    const add = (text: string) => {
      if (line === undefined) return;
      line = (line + text).slice(0, STOP_FAILURE_PREFIX.length + STOP_FAILURE_MAX);
      if (!line.startsWith(STOP_FAILURE_PREFIX) && !STOP_FAILURE_PREFIX.startsWith(line))
        line = undefined;
    };

    const end = () => {
      if (line?.startsWith(STOP_FAILURE_PREFIX))
        this.stopFailed("descendant_stop", new Error(line.slice(STOP_FAILURE_PREFIX.length)));
      line = "";
    };

    stderr.on("data", (chunk: Buffer) => {
      const [first = "", ...rest] = decoder.write(chunk).split("\n");
      add(first);

      for (const part of rest) {
        end();
        add(part);
      }
    });
    stderr.once("close", () => {
      add(decoder.end());
      end();
    });
  }

  private stopFailed(step: string, error: Error): void {
    this.failure ??= { step, message: error.message };
    this.stopError ??= `${step} failed: ${error.message}`;
  }

  private result(exit: ProcessExit): ChildResult {
    const { stopError } = this;
    const common = {
      ...(this.start ? { usageStart: this.start.usageStart } : {}),
      ...(this.start && this.usageEnd ? { usageEnd: this.usageEnd } : {}),
      exit,
      ...(stopError ? { stopError } : {})
    };

    if (this.cancellation !== undefined) {
      return {
        ...common,
        outcome: "cancelled",
        text: stopError ? `${this.cancellation}; ${stopError}` : this.cancellation
      };
    }

    if (this.failure || !this.closing || exit.code !== 0 || exit.error)
      return { ...common, outcome: "failed", text: this.failedText(exit) };

    if (this.lastAssistant?.stopReason === "error") {
      return {
        ...common,
        outcome: "failed",
        text: this.lastAssistant.errorMessage ?? "Child model failed"
      };
    }

    if (this.lastAssistant?.stopReason === "aborted") {
      return {
        ...common,
        outcome: "cancelled",
        text: this.lastAssistant.errorMessage ?? "Child model cancelled"
      };
    }

    return { ...common, outcome: "completed", text: this.text };
  }

  /**
   * Output closed before EOF can miss the records that decide the result, so a completed run fails.
   * The note starts the first line, before the original text, so bounded error lines keep it.
   */
  private noteOutput(result: ChildResult): ChildResult {
    if (!this.outputIncomplete) return result;
    if (result.outcome !== "completed")
      return { ...result, text: `${OUTPUT_INCOMPLETE}; ${result.text}` };

    return { ...result, outcome: "failed", text: `${OUTPUT_INCOMPLETE}\n${result.text}`.trimEnd() };
  }

  /** A distinct cleanup failure starts the first line, so bounded error lines keep it. */
  private failedText(exit: ProcessExit): string {
    const failed = this.failure ?? {
      step: this.step,
      message: exit.error?.message ?? "Child exited before completion"
    };
    const error = `${failed.step} failed (exit code ${exit.code}, signal ${exit.signal}): ${failed.message}`;
    const { stopError } = this;
    if (!stopError || stopError === `${failed.step} failed: ${failed.message}`)
      return `${error}\n${this.connection.stderrTail}`.trimEnd();
    const summary = firstLine(stopError, CLEANUP_SUMMARY_MAX);
    // The body keeps the complete failure when the summary shortens it.
    const full = summary === stopError ? "" : `\n${stopError}`;

    return `${summary}; ${error}${full}\n${this.connection.stderrTail}`.trimEnd();
  }
}
