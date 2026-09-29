import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { noticeType } from "pi-nested-instructions/notices";

import type { Outcome } from "../contracts.ts";
import { stringField } from "../terminal-text.ts";
import type { TranscriptMessage } from "../transcript/session.ts";
import { record } from "../values.ts";

export function hostToolResult(value: unknown): AgentToolResult<unknown> {
  // Pi's execution events and persisted toolResult messages carry AgentToolResult media
  // blocks, but its event API erases the payload type. Adapters still validate details.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as AgentToolResult<unknown>;
}

/** Pi has no cancellation flag on execution results. An unsuccessful completion
 * after the live run is aborted is cancelled; successes and earlier failures stay
 * unchanged. Persist this observation so replay never needs to guess from prose.
 */
export function executionOutcome(isError: boolean, signal?: AbortSignal): Outcome {
  if (!isError) return "success";

  return signal?.aborted ? "cancelled" : "failure";
}

export function isInstructionNotice(input: unknown): boolean {
  const value = record(input);

  return value.role === "custom" && value.customType === noticeType && value.display === true;
}

type AssistantCall = Extract<TranscriptMessage, { kind: "assistant" }>["calls"][number];

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

/** Normalize messages and discover buffered calls before Pi constructs their rows.
 * Streaming content is append-only; starts, finalization, and replay scan the full
 * message. Ordinary updates visit only the changed block and newly visible tail.
 */
export class TranscriptMessages {
  private timestamp: number | undefined;
  private indexedContent = 0;

  constructor(private readonly ownNotices = false) {}

  read(input: unknown, updatedContentIndex?: number): TranscriptMessage | undefined {
    const value = record(input);
    // System updates are invisible; Pi decides whether usage/custom entries insert rows.
    if (value.role === "system" || value.type === "usage" || value.type === "custom") return;
    if (value.role === "custom" && value.display === false) return;
    // Actual inserted notice rows supply a group boundary, not a run boundary.
    if (this.ownNotices && isInstructionNotice(input)) return;
    if (value.role === "toolResult")
      return {
        kind: "result",
        id: String(value.toolCallId),
        name: String(value.toolName),
        result: hostToolResult(input),
        outcome: executionOutcome(value.isError === true)
      };
    if (value.role !== "assistant" || !Array.isArray(value.content)) return { kind: "boundary" };
    const interruption = assistantInterruption(value);

    const timestamp = Number(value.timestamp);
    const start =
      updatedContentIndex === undefined ||
      timestamp !== this.timestamp ||
      value.content.length < this.indexedContent
        ? 0
        : this.indexedContent;
    const calls: AssistantCall[] = [];

    if (updatedContentIndex !== undefined && updatedContentIndex < start) {
      const call = assistantCall(value.content[updatedContentIndex], updatedContentIndex);
      if (call) calls.push(call);
    }

    for (let index = start; index < value.content.length; index++) {
      const call = assistantCall(value.content[index], index);
      if (call) calls.push(call);
    }

    this.timestamp = timestamp;
    this.indexedContent = value.content.length;

    return {
      kind: "assistant",
      timestamp,
      calls,
      ...(interruption ? { interruption } : {})
    };
  }
}
