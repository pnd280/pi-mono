import {
  parseStreamingJson,
  type AssistantMessage,
  type ToolCall,
  type ToolResultMessage
} from "@earendil-works/pi-ai";
import {
  buildSessionProjection,
  type JsonAgentSessionEvent,
  type SessionEntry,
  type SessionProjection
} from "@earendil-works/pi-coding-agent";

/** One run's history in a child session, as RPC `get_entries` or the session file supplies it. */
export interface TranscriptSnapshot {
  sessionId: string;
  runId: string;
  cwd: string;
  entries: readonly SessionEntry[];
  leafId: string | null;
}

export type TranscriptMessage = SessionProjection["messages"][number];

export interface ToolOutput {
  content: ToolResultMessage["content"];
  details: unknown;
  isError: boolean;
}

export type TranscriptItem =
  | { kind: "message"; key: string; message: TranscriptMessage; streaming: boolean }
  | {
      kind: "tool";
      key: string;
      call: ToolCall;
      output: ToolOutput | undefined;
      partial: boolean;
      started: boolean;
    };

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

type Execution = { output: ToolOutput | undefined; partial: boolean };

type MessageUpdate = Extract<JsonAgentSessionEvent, { type: "message_update" }>;

/** Tool call IDs can repeat in a resumed conversation; the owning message scopes them. */
function executionKey(timestamp: number, id: string): string {
  return `${timestamp}\0${id}`;
}

/**
 * Saved entries are authoritative. Streamed assistant messages and tool executions overlay
 * them until the matching entries arrive.
 */
export class Transcript {
  private snapshot: TranscriptSnapshot | undefined;
  private projection: SessionProjection | undefined;
  /** The last saved assistant message on the branch. */
  private latest: AssistantMessage | undefined;
  private saved = new Set<number>();
  private pending = new Map<number, AssistantMessage>();
  private streaming: AssistantMessage | undefined;
  /** Argument JSON received so far, by content index of the streaming message. */
  private json = new Map<number, string>();
  /** The owning assistant message timestamp of each call that this connection observed. */
  private calls = new Map<string, number>();
  private executions = new Map<string, Execution>();
  private listeners = new Set<() => void>();
  private running: boolean;

  /** observed: a connection reports the child's events; otherwise only snapshots arrive. */
  constructor(private readonly observed: boolean) {
    this.running = observed;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  /** running: whether the task is active; events report this when the transcript is observed. */
  replace(snapshot: TranscriptSnapshot, running: boolean): void {
    if (!this.observed) this.running = running;

    if (
      this.snapshot &&
      (this.snapshot.sessionId !== snapshot.sessionId || this.snapshot.runId !== snapshot.runId)
    ) {
      this.pending.clear();
      this.streaming = undefined;
      this.calls.clear();
      this.executions.clear();
    }

    this.snapshot = snapshot;
    this.projection = buildSessionProjection([...snapshot.entries], snapshot.leafId);
    this.saved.clear();
    this.latest = undefined;
    for (const entry of this.projection.entries)
      for (const message of entry.messages) if (message.role === "assistant") this.latest = message;
    const owners = new Map<string, number>();

    for (const entry of snapshot.entries) {
      if (entry.type !== "message") continue;
      const { message } = entry;

      if (message.role === "assistant") {
        this.saved.add(message.timestamp);
        for (const block of message.content)
          if (block.type === "toolCall") owners.set(block.id, message.timestamp);
      } else if (message.role === "toolResult") {
        const owner = owners.get(message.toolCallId);
        if (owner !== undefined) this.executions.delete(executionKey(owner, message.toolCallId));
      }
    }

    for (const timestamp of this.pending.keys())
      if (this.saved.has(timestamp)) this.pending.delete(timestamp);
    if (this.streaming && this.saved.has(this.streaming.timestamp)) this.streaming = undefined;
    this.changed();
  }

  event(event: JsonAgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        this.running = true;
        break;
      case "agent_settled":
        this.running = false;
        this.streaming = undefined;
        this.calls.clear();
        break;
      case "message_start":

      case "message_end": {
        if (event.message.role !== "assistant") return;
        const message = structuredClone(event.message);
        for (const block of message.content)
          if (block.type === "toolCall") this.calls.set(block.id, message.timestamp);
        this.streaming = event.type === "message_start" ? message : undefined;
        this.json.clear();
        if (!this.saved.has(message.timestamp)) this.pending.set(message.timestamp, message);
        break;
      }

      case "message_update":
        if (!this.streaming) return;
        this.streaming.usage = structuredClone(event.usage);
        this.update(this.streaming, event.assistantMessageEvent);
        break;
      case "tool_execution_start":
      case "tool_execution_update":

      case "tool_execution_end": {
        const owner = this.calls.get(event.toolCallId);
        if (owner === undefined) return;
        const key = executionKey(owner, event.toolCallId);
        if (event.type === "tool_execution_start")
          this.executions.set(key, { output: undefined, partial: false });
        else if (event.type === "tool_execution_update")
          this.executions.set(key, { output: output(event.partialResult, false), partial: true });
        else
          this.executions.set(key, { output: output(event.result, event.isError), partial: false });
        break;
      }

      default:
        return;
    }

    this.changed();
  }

  /** The source stopped: its unresolved calls are interrupted. */
  stop(): void {
    this.running = false;
    this.streaming = undefined;
    this.calls.clear();
    this.changed();
  }

  private update(message: AssistantMessage, update: MessageUpdate["assistantMessageEvent"]): void {
    if (!("contentIndex" in update)) return;
    const index = update.contentIndex;
    const block = message.content[index];

    switch (update.type) {
      case "text_start":
        message.content[index] = { type: "text", text: "" };
        break;
      case "text_delta":
        if (block?.type === "text") block.text += update.delta;
        break;
      case "text_end":
        message.content[index] = { type: "text", text: update.content };
        break;
      case "thinking_start":
        message.content[index] = { type: "thinking", thinking: "" };
        break;
      case "thinking_delta":
        if (block?.type === "thinking") block.thinking += update.delta;
        break;
      case "thinking_end":
        message.content[index] = { type: "thinking", thinking: update.content };
        break;
      case "toolcall_start":
        this.calls.set(update.id, message.timestamp);
        message.content[index] = {
          type: "toolCall",
          id: update.id,
          name: update.toolName,
          arguments: {}
        };
        break;

      case "toolcall_delta": {
        if (block?.type !== "toolCall") break;
        const json = (this.json.get(index) ?? "") + update.delta;
        this.json.set(index, json);
        // A new object: the viewer updates arguments by identity.
        block.arguments = parseStreamingJson(json);
        break;
      }

      case "toolcall_end":
        this.json.delete(index);
        message.content[index] = structuredClone(update.toolCall);
        break;
    }
  }

  /** Display rows in transcript order, keyed so components survive refreshes and saving. */
  items(): TranscriptItem[] {
    const items: TranscriptItem[] = [];
    const keys = new Set<string>();
    const open = new Map<string, ToolItem>();
    /** Calls without a result that this connection cannot complete. */
    const stale = new Set<ToolItem>();

    const unique = (base: string) => {
      let key = base;
      for (let index = 1; keys.has(key); index++) key = `${base}\0${index}`;
      keys.add(key);

      return key;
    };

    const assistant = (message: AssistantMessage, streaming: boolean) => {
      const key = unique(`assistant\0${message.timestamp}`);
      items.push({ kind: "message", key, message, streaming });
      const failure = failed(message);

      for (const [index, call] of message.content.entries()) {
        if (call.type !== "toolCall") continue;
        const execution = this.executions.get(executionKey(message.timestamp, call.id));
        const item: ToolItem = {
          kind: "tool",
          key: `${key}\0${index}`,
          call,
          output: failure ?? execution?.output,
          partial: failure ? false : (execution?.partial ?? false),
          started: execution !== undefined
        };
        open.set(call.id, item);
        // A connection observes every call it runs, so earlier unresolved calls never finish.
        // Without one, only the calls of the latest response can still run.
        const current = this.observed
          ? this.calls.get(call.id) === message.timestamp
          : message === this.latest;
        if (!this.running || !current) stale.add(item);
        items.push(item);
      }
    };

    for (const entry of this.projection?.entries ?? []) {
      // Removing a result from model context does not undo its recorded completion.
      const messages =
        entry.messages.length === 0 &&
        entry.sourceEntry.type === "message" &&
        entry.sourceEntry.message.role === "toolResult"
          ? [entry.sourceEntry.message]
          : entry.messages;

      for (const [index, message] of messages.entries()) {
        if (message.role === "assistant") assistant(message, false);
        else if (message.role === "toolResult") {
          const item = open.get(message.toolCallId);
          if (!item) continue;
          item.output = {
            content: message.content,
            details: message.details,
            isError: message.isError
          };
          item.partial = false;
          open.delete(message.toolCallId);
          stale.delete(item);
        } else
          items.push({
            kind: "message",
            key: unique(`${entry.sourceEntry.id}\0${index}`),
            message,
            streaming: false
          });
      }
    }

    for (const message of this.pending.values()) assistant(message, message === this.streaming);

    for (const item of stale) {
      if (item.output && !item.partial) continue;
      item.output = interrupted(item.output);
      item.partial = false;
    }

    return items;
  }

  dispose(): void {
    this.listeners.clear();
  }
}

/** Derived outputs keep their identity, so the viewer updates a row only when it changes. */
const failures = new WeakMap<AssistantMessage, ToolOutput>();
const interruptions = new WeakMap<ToolOutput, ToolOutput>();
const unfinished: ToolOutput = {
  content: [{ type: "text", text: "Interrupted" }],
  details: undefined,
  isError: true
};

/** Pi reports the unexecuted calls of a failed response as errors. */
function failed(message: AssistantMessage): ToolOutput | undefined {
  if (message.stopReason !== "aborted" && message.stopReason !== "error") return;
  let result = failures.get(message);

  if (!result) {
    const text =
      message.stopReason === "aborted" ? "Operation aborted" : message.errorMessage || "Error";
    result = { content: [{ type: "text", text }], details: undefined, isError: true };
    failures.set(message, result);
  }

  return result;
}

/** Keep partial output that an unfinished call produced. */
function interrupted(partial: ToolOutput | undefined): ToolOutput {
  if (!partial) return unfinished;
  let result = interruptions.get(partial);

  if (!result) {
    result = {
      content: [...partial.content, ...unfinished.content],
      details: partial.details,
      isError: true
    };
    interruptions.set(partial, result);
  }

  return result;
}

function output(value: unknown, isError: boolean): ToolOutput {
  // Execution events carry AgentToolResult values, but Pi's event API erases their type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const result = value as Partial<Pick<ToolOutput, "content" | "details">> | undefined;

  return { content: result?.content ?? [], details: result?.details, isError };
}
