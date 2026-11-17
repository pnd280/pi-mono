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

import { MARKER_ENTRY } from "../constants.ts";
import type { RunHistory } from "./sessions.ts";

export type TranscriptMessage = SessionProjection["messages"][number];

export type ToolOutput = {
  content: ToolResultMessage["content"];
  details: unknown;
  isError: boolean;
  durationMs?: number;
};

export type TranscriptItem =
  | { kind: "message"; key: string; message: TranscriptMessage; streaming: boolean }
  | {
      kind: "tool";
      key: string;
      call: ToolCall;
      output: ToolOutput | undefined;
      partial: boolean;
    };

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

type Execution = { output: ToolOutput | undefined; partial: boolean };

/**
 * The compactions on the viewed branch of the child file, including those of earlier runs, and whether the child is compacting now.
 */
export type Compactions = {
  count: number;
  /** The context tokens before the latest compaction. */
  tokensBefore: number | undefined;
  running: boolean;
};

type MessageUpdate = Extract<JsonAgentSessionEvent, { type: "message_update" }>;

/** Tool call IDs can repeat in a resumed conversation; the owning message scopes them. */
function executionKey(owner: number, id: string): string {
  return `${owner}\0${id}`;
}

function observedKey(owner: number): string {
  return `assistant\0${owner}`;
}

/**
 * Saved entries are authoritative. Streamed assistant messages and tool executions overlay them until the matching entries arrive. A transcript follows one task: a history or a connection of another run ends the earlier run's overlay.
 *
 * Each observed assistant message is numbered in arrival order. Timestamps are request start times in milliseconds, so distinct messages can share one; saved assistant entries match observed messages one-to-one, in order, by timestamp.
 *
 * Only entries after the branch's last run marker match observed messages or settle their executions. That marker belongs to `history.runId`, because a run's branch ends before any later marker.
 */
export class Transcript {
  /** The run that the overlay belongs to. */
  private run: string | undefined;
  private projection: SessionProjection | undefined;
  /** The last saved assistant message on the branch. */
  private latest: AssistantMessage | undefined;
  /** The assistant messages that this connection observed; the index numbers each one. */
  private messages: AssistantMessage[] = [];
  /** The observed message that each saved assistant entry holds, by entry ID. */
  private matches = new Map<string, number>();
  private streaming: { owner: number; message: AssistantMessage } | undefined;
  /** Argument JSON received so far, by content index of the streaming message. */
  private json = new Map<number, string>();
  /** The observed message that owns each call that this connection observed. */
  private calls = new Map<string, number>();
  private executions = new Map<string, Execution>();
  private listeners = new Set<() => void>();
  /** Whether a connection reports the child's events; otherwise only histories arrive. */
  private observed = false;
  private running = false;
  private compacted: Omit<Compactions, "running"> = { count: 0, tokensBefore: undefined };
  /** Only a connection reports a compaction while it runs. */
  private compacting = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  /** A connection reports the events of run `runId` from its start. */
  observe(runId: string): void {
    this.observed = true;
    this.running = true;
    this.reset(runId);
    this.changed();
  }

  /** running: whether the task is active; events report this when the transcript is observed. */
  replace(history: RunHistory, running: boolean): void {
    if (!this.observed) this.running = running;
    if (history.runId !== this.run) this.reset(history.runId);
    const { entries } = history;
    this.projection = buildSessionProjection([...entries], entries.at(-1)?.id ?? null);
    this.matches.clear();
    this.latest = undefined;
    this.compacted = compacted(entries);
    for (const entry of this.projection.entries)
      for (const message of entry.messages) if (message.role === "assistant") this.latest = message;
    const owners = new Map<string, number>();
    /** The first observed message that no earlier saved entry matched. */
    let next = 0;

    for (const entry of runEntries(entries)) {
      if (entry.type !== "message") continue;
      const { message } = entry;

      if (message.role === "assistant") {
        const owner = this.messages.findIndex(
          (observed, index) => index >= next && observed.timestamp === message.timestamp
        );
        if (owner < 0) continue;
        next = owner + 1;
        this.matches.set(entry.id, owner);
        for (const block of message.content)
          if (block.type === "toolCall") owners.set(block.id, owner);
      } else if (message.role === "toolResult") {
        const owner = owners.get(message.toolCallId);
        if (owner !== undefined) this.executions.delete(executionKey(owner, message.toolCallId));
      }
    }

    // The streaming message is the latest observed one, so a match at or after it is its own.
    if (this.streaming && next > this.streaming.owner) this.streaming = undefined;
    this.changed();
  }

  private reset(runId: string): void {
    this.run = runId;
    this.projection = undefined;
    this.latest = undefined;
    this.matches.clear();
    this.json.clear();
    this.messages = [];
    this.streaming = undefined;
    this.calls.clear();
    this.executions.clear();
    this.compacted = { count: 0, tokensBefore: undefined };
    this.compacting = false;
  }

  compactions(): Compactions {
    return { ...this.compacted, running: this.compacting };
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
      case "compaction_start":
      case "compaction_end":
        this.compacting = event.type === "compaction_start";
        break;
      case "message_start":

      case "message_end":
        if (event.message.role !== "assistant") return;
        this.message(event.message, event.type === "message_start");
        break;

      case "message_update":
        if (!this.streaming) return;
        this.streaming.message.usage = structuredClone(event.usage);
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
          this.executions.set(key, {
            output: output(event.result, event.isError, event.durationMs),
            partial: false
          });
        break;
      }

      default:
        return;
    }

    this.changed();
  }

  /** An assistant message starts, or ends and replaces the message that its start began. */
  private message(event: AssistantMessage, start: boolean): void {
    const owner = !start && this.streaming ? this.streaming.owner : this.messages.length;
    const message = structuredClone(event);
    for (const block of message.content)
      if (block.type === "toolCall") this.calls.set(block.id, owner);
    this.messages[owner] = message;
    this.streaming = start ? { owner, message } : undefined;
    this.json.clear();
  }

  /** The source stopped: its unresolved calls are interrupted. */
  stop(): void {
    this.running = false;
    this.compacting = false;
    this.streaming = undefined;
    this.calls.clear();
    this.changed();
  }

  private update(
    { owner, message }: { owner: number; message: AssistantMessage },
    update: MessageUpdate["assistantMessageEvent"]
  ): void {
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
        this.calls.set(update.id, owner);
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

    /** An observed message keeps its key when its saved entry replaces it. */
    const assistant = (
      message: AssistantMessage,
      key: string,
      owner: number | undefined,
      streaming: boolean
    ) => {
      items.push({ kind: "message", key, message, streaming });
      const failure = failed(message);

      for (const [index, call] of message.content.entries()) {
        if (call.type !== "toolCall") continue;
        const execution =
          owner === undefined ? undefined : this.executions.get(executionKey(owner, call.id));
        const item: ToolItem = {
          kind: "tool",
          key: `${key}\0${index}`,
          call,
          output: failure ?? execution?.output,
          partial: failure ? false : (execution?.partial ?? false)
        };
        open.set(call.id, item);
        // A connection observes every call it runs, so earlier unresolved calls never finish. Without one, only the calls of the latest response can still run.
        const current = this.observed
          ? owner !== undefined && this.calls.get(call.id) === owner
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
        if (message.role === "assistant") {
          const owner = this.matches.get(entry.sourceEntry.id);
          const key =
            owner === undefined ? `${entry.sourceEntry.id}\0${index}` : observedKey(owner);
          assistant(message, unique(key), owner, false);
        } else if (message.role === "toolResult") {
          const item = open.get(message.toolCallId);
          if (!item) continue;
          item.output = {
            content: message.content,
            details: message.details,
            isError: message.isError,
            ...(message.durationMs === undefined ? {} : { durationMs: message.durationMs })
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

    const saved = new Set(this.matches.values());
    for (const [owner, message] of this.messages.entries())
      if (!saved.has(owner))
        assistant(message, unique(observedKey(owner)), owner, owner === this.streaming?.owner);

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

/** The entries after the branch's last run marker. */
function runEntries(entries: readonly SessionEntry[]): readonly SessionEntry[] {
  let start = 0;
  for (const [index, entry] of entries.entries())
    if (entry.type === "custom" && entry.customType === MARKER_ENTRY) start = index + 1;

  return entries.slice(start);
}

/** Count the whole branch: the model-context projection can omit older compactions. */
function compacted(entries: readonly SessionEntry[]): Omit<Compactions, "running"> {
  let result: Omit<Compactions, "running"> = { count: 0, tokensBefore: undefined };
  for (const entry of entries)
    if (entry.type === "compaction")
      result = { count: result.count + 1, tokensBefore: entry.tokensBefore };

  return result;
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

function output(value: unknown, isError: boolean, durationMs?: number): ToolOutput {
  // Execution events carry AgentToolResult values, but Pi's event API erases their type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const result = value as Partial<Pick<ToolOutput, "content" | "details">> | undefined;

  return {
    content: result?.content ?? [],
    details: result?.details,
    isError,
    ...(durationMs === undefined ? {} : { durationMs })
  };
}
