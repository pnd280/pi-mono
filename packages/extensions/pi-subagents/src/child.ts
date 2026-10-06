import { spawn } from "node:child_process";

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  JsonAgentSessionEvent,
  RpcCommand,
  RpcExtensionUIRequest,
  RpcResponse,
  SessionStats,
  SessionEntry
} from "@earendil-works/pi-coding-agent";

import { checkpointSession } from "./checkpoints.ts";
import { ChildConnection, type ProcessExit, type RpcRecord } from "./connection.ts";
import { DEPTH_ENV, STOP_GRACE_MS, TASK_ID_ENV } from "./constants.ts";
import { childArgs, type ChildSelection, type PiInvocation } from "./invocation.ts";
import { forceStop, isAlive, processOptions, terminateTree } from "./platform.ts";

export type ChildStart = {
  taskId: string;
  sessionId: string;
  sessionFile: string;
  /** The model and thinking level that the child applied after Pi resolved and clamped the selection. */
  model?: string;
  thinking: string;
  usageStart: SessionStats;
};

export type ChildResult = {
  taskId?: string;
  sessionFile?: string;
  outcome: "completed" | "failed" | "cancelled";
  text: string;
  usageStart?: SessionStats;
  usageEnd?: SessionStats;
  activity?: string;
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
  restored?: { sessionId: string; entries: readonly SessionEntry[] };
  onStart?: (start: ChildStart) => void | Promise<void>;
  onCheckpoint?: () => Promise<void>;
  onActivity?: (activity: string) => void;
  onEvent?: (event: JsonAgentSessionEvent) => void;
  onUIRequest?: (request: RpcExtensionUIRequest) => void;
  onStep?: (step: string) => void;
};

/** One process lifetime, including the wait for exit after EOF or cancellation. */
export class ChildRun {
  private ready = Promise.withResolvers<ChildStart | undefined>();
  readonly started = this.ready.promise;
  readonly connection: ChildConnection;
  readonly done: Promise<ChildResult>;
  private start: ChildStart | undefined;
  private usageEnd: SessionStats | undefined;
  private lastAssistant: AssistantMessage | undefined;
  private text = "";
  private activity: string | undefined;
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
  private checkpointingStop = false;
  private finished = false;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private clearForceStop: (() => void) | undefined;

  constructor(private readonly options: ChildOptions) {
    options.onStep?.("spawn");
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

      return this.result(exit);
    });
    void this.launch().catch((error: unknown) => this.fail(error));
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
      terminateTree(
        this.connection.process,
        (step) => this.options.onStep?.(step),
        (error) => {
          this.failure ??= { step: "terminate_tree", message: error.message };
        }
      );
    }

    return this.done;
  }

  private async request(command: RpcCommand): Promise<Extract<RpcResponse, { success: true }>> {
    this.step = command.type;
    this.options.onStep?.(this.step);
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

  private async launch(): Promise<void> {
    if (this.options.sessionFile === undefined) await this.newSession();

    const state = await this.request({ type: "get_state" });

    if (state.command !== "get_state" || !state.data.sessionFile) {
      throw new Error("Child has no session file");
    }

    if (this.options.restored) {
      if (state.data.sessionId !== this.options.restored.sessionId)
        throw new Error("Restored child session identity mismatch");
      const snapshot = await this.snapshot();
      const branch = new Map(
        checkpointSession(snapshot)
          .getBranch()
          .map((entry) => [entry.id, entry])
      );
      if (
        this.options.restored.entries.some(
          (entry) => JSON.stringify(branch.get(entry.id)) !== JSON.stringify(entry)
        )
      )
        throw new Error("Restored child history does not match its checkpoint");
    }

    if (this.closing) return;
    const usage = await this.request({ type: "get_session_stats" });
    if (usage.command !== "get_session_stats") throw new Error("Missing child usage");
    this.start = {
      taskId: this.options.taskId ?? state.data.sessionId,
      sessionId: state.data.sessionId,
      sessionFile: state.data.sessionFile,
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

  async snapshot() {
    const response = await this.request({ type: "get_entries" });
    if (response.command !== "get_entries") throw new Error("Missing child entries");

    return {
      sessionId: this.start?.sessionId ?? this.options.restored?.sessionId ?? "",
      cwd: this.options.cwd,
      ...response.data
    };
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
      this.options.onUIRequest?.(record);

      return;
    }

    this.observeEvent(record);
    this.options.onEvent?.(record);
  }

  private observeEvent(event: JsonAgentSessionEvent): void {
    if (event.type === "agent_start") {
      this.agentEnded = false;
      this.settled = false;
      this.epoch++;
    } else if (event.type === "agent_end") {
      this.agentEnded = true;
      if (this.closing) this.checkpointAndClose();
    } else if (event.type === "agent_settled") {
      this.settled = true;
      this.epoch++;
      this.options.onStep?.("agent_settled");
    } else if (event.type === "message_end" && event.message.role === "assistant") {
      this.lastAssistant = event.message;
    } else if (event.type === "tool_execution_start" && this.activity !== event.toolName) {
      this.activity = event.toolName;
      this.options.onActivity?.(this.activity);
    }
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
      await this.options.onCheckpoint?.();

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

    this.options.onStep?.("clear_queue");
    void this.connection.request({ type: "clear_queue" }).catch(() => {});
    this.options.onStep?.("abort");
    // EOF disposes collectors. Capture terminal events first, without waiting for settle hooks.
    void this.connection.request({ type: "abort" }).then(
      () => this.checkpointAndClose(),
      () => this.closeInput()
    );
    if (this.agentEnded) this.checkpointAndClose();
    this.scheduleStop();
  }

  private checkpointAndClose(): void {
    if (this.checkpointingStop || this.inputClosed || this.finished) return;
    this.checkpointingStop = true;
    void Promise.resolve()
      .then(() => this.options.onCheckpoint?.())
      .finally(() => this.closeInput())
      .catch(() => {});
  }

  private closeInput(): void {
    this.closing = true;
    if (this.inputClosed || this.finished) return;
    this.inputClosed = true;
    this.step = "close_stdin";
    this.options.onStep?.(this.step);
    this.connection.closeInput();
    this.scheduleStop();
  }

  private scheduleStop(): void {
    if (this.stopTimer !== undefined || this.finished) return;
    // Abort, checkpoint capture, and shutdown share one deadline, including blocked settle hooks.
    this.stopTimer = setTimeout(() => {
      if (!isAlive(this.connection.process)) return;
      this.closeInput();
      this.clearForceStop = forceStop(
        this.connection.process,
        (step) => this.options.onStep?.(step),
        (error) => {
          this.failure ??= { step: "force_stop", message: error.message };
        }
      );
    }, this.options.shutdownGraceMs ?? STOP_GRACE_MS);
  }

  private result(exit: ProcessExit): ChildResult {
    const common = {
      ...this.start,
      ...(this.usageEnd ? { usageEnd: this.usageEnd } : {}),
      ...(this.activity ? { activity: this.activity } : {}),
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
