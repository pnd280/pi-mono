import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import { instructionNotice } from "../adapters/pi-nested-instructions/notices.ts";
import type { Outcome } from "../contracts.ts";
import { record, stringField } from "../values.ts";
import type { AssistantCall, TranscriptMessage } from "./session.ts";

export function hostToolResult(value: unknown): AgentToolResult<unknown> {
  // Pi's execution events and persisted toolResult messages carry AgentToolResult media blocks, but its event API erases the payload type. Adapters still validate details.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as AgentToolResult<unknown>;
}

/** Pi has no cancellation flag on execution results. An unsuccessful completion after the live run is aborted is cancelled; successes and earlier failures stay unchanged. Persist this observation so replay never needs to guess from prose. */
export function executionOutcome(isError: boolean, signal?: AbortSignal): Outcome {
  if (!isError) return "success";

  return signal?.aborted ? "cancelled" : "failure";
}

/** Pi's tool duration; session files are external data. */
export function validDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toolResult(value: Record<string, unknown>, input: unknown): TranscriptMessage {
  return {
    kind: "result",
    id: String(value.toolCallId),
    name: String(value.toolName),
    result: hostToolResult(input),
    outcome: executionOutcome(value.isError === true),
    ...(validDuration(value.durationMs) ? { durationMs: value.durationMs } : {})
  };
}

function assistantCall(block: unknown, index: number): AssistantCall | undefined {
  const content = record(block);

  // Pi renders assistant content before its tool rows, regardless of block order.
  return content.type === "toolCall"
    ? { index, id: String(content.id), name: String(content.name), args: content.arguments }
    : undefined;
}

function assistantInterruption(
  value: Record<string, unknown>
): Extract<TranscriptMessage, { kind: "assistant" }>["interruption"] {
  if (value.stopReason === "aborted") return { outcome: "cancelled", text: "Operation aborted" };
  if (value.stopReason === "error")
    return { outcome: "failure", text: stringField(value.errorMessage) || "Error" };

  return undefined;
}

function hasAssistantBoundary(
  value: Record<string, unknown>,
  content: readonly unknown[]
): boolean {
  if (value.stopReason === "length") return true;
  if (
    (value.stopReason === "aborted" || value.stopReason === "error") &&
    !content.some((block) => record(block).type === "toolCall")
  )
    return true;

  return content.some((block) => {
    const value = record(block);

    return value.type === "text" && typeof value.text === "string" && value.text.trim().length > 0;
  });
}

/** The source of each assistant message object that a read has seen, shared by live collection and transcript reconstruction. Pi saves the finalised message object and replays that object, so a replay reuses the source that its stream started and records the message's predecessor once. Distinct messages are distinct objects, even when their timestamps match. */
const sources = new WeakMap<object, object>();

/** Normalise messages and discover buffered calls before Pi constructs their rows. Streaming content is append-only; starts, finalisation, and replay scan the full message. Ordinary updates visit only the changed block and newly visible tail. */
export class TranscriptMessages {
  private timestamp: number | undefined;
  private indexedContent = 0;
  private source: object = {};

  constructor(private readonly ownNotices = false) {}

  /** `continued` marks a stream update or the finalised version of the assistant message that the previous read started. Every other assistant message object is a new message unless a read has already seen it, even when its timestamp matches. */
  read(
    input: unknown,
    updatedContentIndex?: number,
    continued = false
  ): TranscriptMessage | undefined {
    const value = record(input);
    // System updates are invisible; Pi decides whether usage/custom entries insert rows.
    if (value.role === "system" || value.type === "usage" || value.type === "custom") return;
    if (value.role === "custom" && value.display === false) return;
    // Actual inserted notice rows supply a group boundary, not a run boundary.
    const notice = this.ownNotices ? instructionNotice(input) : undefined;
    if (notice)
      return {
        kind: "notice",
        id: JSON.stringify([value.timestamp, value.details]),
        notice: notice.summary
      };
    if (value.role === "toolResult") return toolResult(value, input);
    if (value.role !== "assistant" || !Array.isArray(value.content)) return { kind: "boundary" };

    return this.assistant(value, value.content, updatedContentIndex, continued);
  }

  private assistant(
    value: Record<string, unknown>,
    content: readonly unknown[],
    updatedContentIndex: number | undefined,
    continued: boolean
  ): TranscriptMessage {
    const interruption = assistantInterruption(value);
    const timestamp = Number(value.timestamp);
    const same = continued && timestamp === this.timestamp;
    if (!same) this.source = sources.get(value) ?? {};
    sources.set(value, this.source);
    const start = updatedContentIndex === undefined || !same ? 0 : this.indexedContent;
    const calls: AssistantCall[] = [];

    if (updatedContentIndex !== undefined && updatedContentIndex < start) {
      const call = assistantCall(content[updatedContentIndex], updatedContentIndex);
      if (call) calls.push(call);
    }

    for (let index = start; index < content.length; index++) {
      const call = assistantCall(content[index], index);
      if (call) calls.push(call);
    }

    this.timestamp = timestamp;
    this.indexedContent = content.length;

    return {
      kind: "assistant",
      source: this.source,
      timestamp,
      calls,
      boundary: hasAssistantBoundary(value, content),
      ...(interruption ? { interruption } : {})
    };
  }
}
