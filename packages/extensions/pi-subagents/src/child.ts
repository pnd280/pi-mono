import { spawn } from "node:child_process";

import type { AssistantMessage } from "@earendil-works/pi-ai";
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

import { ChildConnection, type ProcessExit, type RpcRecord } from "./connection.ts";
import {
  DEPTH_ENV,
  PROTOCOL_KEY,
  PROTOCOL_VERSION,
  STOP_GRACE_MS,
  TASK_ID_ENV
} from "./constants.ts";
import { childArgs, type ChildSelection, type PiInvocation } from "./invocation.ts";
import { forceStop, isAlive, processOptions, terminateTree } from "./platform.ts";
import { childMessageSchema, decode, encode, type ChildMessage } from "./protocol.ts";

type Begun = Extract<ChildMessage, { kind: "begun" }>;

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
  private text = "";
  private activity = "";
  private step = "spawn";
  private failure: { step: string; message: string } | undefined;
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
  private clearForceStop: (() => void) | undefined;
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
    this.done = this.connection.closed.then((exit) => {
      this.finished = true;
      this.ready.resolve(undefined);
      clearTimeout(this.stopTimer);
      this.clearForceStop?.();
      this.setActivity("");

      return this.result(exit);
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
      this.clearForceStop?.();
      terminateTree(this.connection.process, (error) => {
        this.failure ??= { step: "terminate_tree", message: error.message };
      });
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
        if (text.command === "get_last_assistant_text") this.text = text.data.text ?? "";
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
      this.clearForceStop = forceStop(this.connection.process, (error) => {
        this.failure ??= { step: "force_stop", message: error.message };
      });
    }, this.options.shutdownGraceMs ?? STOP_GRACE_MS);
  }

  private result(exit: ProcessExit): ChildResult {
    const common = {
      ...(this.start ? { usageStart: this.start.usageStart } : {}),
      ...(this.start && this.usageEnd ? { usageEnd: this.usageEnd } : {}),
      exit
    };

    if (this.cancellation !== undefined) {
      return { ...common, outcome: "cancelled", text: this.cancellation };
    }

    if (this.failure || !this.closing || exit.code !== 0 || exit.error) {
      const failed = this.failure ?? {
        step: this.step,
        message: exit.error?.message ?? "Child exited before completion"
      };

      return {
        ...common,
        outcome: "failed",
        text: `${failed.step} failed (exit code ${exit.code}, signal ${exit.signal}): ${failed.message}\n${this.connection.stderrTail}`.trimEnd()
      };
    }

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
}
