import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  JsonAgentSessionEvent,
  SessionEntry,
  SessionProjection
} from "@earendil-works/pi-coding-agent";

export type TranscriptMessage = SessionProjection["messages"][number];

export function messageIdentity(message: TranscriptMessage): string {
  return JSON.stringify([
    message.role,
    message.timestamp,
    message.role === "toolResult" ? message.toolCallId : null
  ]);
}

/** Own reconstructed blocks; authoritative end events replace, never append, buffered data. */
export class WireMessages {
  readonly pending = new Map<string, TranscriptMessage>();
  private streaming: AssistantMessage | undefined;
  private calls = new Map<string, number>();
  private thinking = new Set<number>();
  private settled = new WeakSet<TranscriptMessage>();

  event(event: JsonAgentSessionEvent): void {
    if (event.type === "message_start" || event.type === "message_end") {
      const message = structuredClone(event.message);

      if (message.role === "assistant") {
        for (const block of message.content)
          if (block.type === "toolCall") this.calls.set(block.id, message.timestamp);
        if (this.streaming) this.pending.delete(messageIdentity(this.streaming));
        this.streaming = event.type === "message_start" ? message : undefined;
        this.thinking.clear();
      }

      this.pending.set(messageIdentity(message), message);

      return;
    }

    if (event.type !== "message_update" || !this.streaming) return;
    this.streaming.usage = structuredClone(event.usage);
    this.update(this.streaming, event.assistantMessageEvent);
    this.pending.set(messageIdentity(this.streaming), this.streaming);
  }

  private update(
    message: AssistantMessage,
    update: Extract<JsonAgentSessionEvent, { type: "message_update" }>["assistantMessageEvent"]
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
        this.thinking.add(index);
        break;
      case "thinking_delta":
        if (block?.type === "thinking") block.thinking += update.delta;
        break;
      case "thinking_end":
        message.content[index] = { type: "thinking", thinking: update.content };
        this.thinking.delete(index);
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
      case "toolcall_end":
        message.content[index] = structuredClone(update.toolCall);
        break;
    }
  }

  reconcile(messages: readonly TranscriptMessage[]): void {
    for (const message of messages) this.pending.delete(messageIdentity(message));
  }

  /**
   * Pi saves a custom message with a new entry timestamp, so its identity differs from the
   * streamed message. Match each saved entry to one pending message that has the same fields
   * and was sent before the entry was saved.
   */
  reconcileCustom(entries: readonly SessionEntry[]): void {
    for (const entry of entries) {
      if (entry.type !== "custom_message") continue;
      const saved = Date.parse(entry.timestamp);

      for (const [identity, message] of this.pending)
        if (
          message.role === "custom" &&
          message.timestamp <= saved &&
          message.customType === entry.customType &&
          message.display === entry.display &&
          JSON.stringify(message.content) === JSON.stringify(entry.content) &&
          JSON.stringify(message.details) === JSON.stringify(entry.details)
        ) {
          this.pending.delete(identity);
          break;
        }
    }
  }

  /** Content indices of thinking blocks that started but have not emitted `thinking_end`. */
  activeThinking(message: TranscriptMessage): ReadonlySet<number> {
    return message === this.streaming ? this.thinking : new Set();
  }

  callTimestamp(id: string): number | undefined {
    return this.calls.get(id);
  }

  isLive(message: TranscriptMessage): boolean {
    return !this.settled.has(message);
  }

  /** Retain provisional messages for reconciliation, but end their live activity. */
  settle(): void {
    this.streaming = undefined;
    this.thinking.clear();
    for (const message of this.pending.values()) this.settled.add(message);
  }

  clear(): void {
    this.pending.clear();
    this.streaming = undefined;
    this.calls.clear();
    this.thinking.clear();
    this.settled = new WeakSet();
  }
}
