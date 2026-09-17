import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

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

type AssistantCall = Extract<TranscriptMessage, { kind: "assistant" }>["calls"][number];

function assistantCall(block: unknown, index: number): AssistantCall | undefined {
  const content = record(block);

  // Pi renders assistant content before its tool rows, regardless of block order.
  return content.type === "toolCall"
    ? { index, id: String(content.id), name: String(content.name), args: content.arguments }
    : undefined;
}

/** Normalize Pi messages before they enter the session-independent transcript controller. */
export function transcriptMessage(
  input: unknown,
  updatedContentIndex?: number
): TranscriptMessage | undefined {
  const value = record(input);
  if (value.type === "custom") return; // The host may suppress or reposition this entry.
  if (value.role === "custom" && value.display === false) return;
  if (value.role === "toolResult")
    return {
      kind: "result",
      id: String(value.toolCallId),
      name: String(value.toolName),
      result: hostToolResult(input),
      outcome: executionOutcome(value.isError === true)
    };
  if (value.role !== "assistant" || !Array.isArray(value.content)) return { kind: "boundary" };
  let interruption: Extract<TranscriptMessage, { kind: "assistant" }>["interruption"];
  if (value.stopReason === "aborted")
    interruption = { outcome: "cancelled", text: "Operation aborted" };
  else if (value.stopReason === "error")
    interruption = { outcome: "failure", text: stringField(value.errorMessage) || "Error" };

  const calls: AssistantCall[] = [];

  if (updatedContentIndex === undefined) {
    for (const [index, block] of value.content.entries()) {
      const call = assistantCall(block, index);
      if (call) calls.push(call);
    }
  } else {
    const call = assistantCall(value.content[updatedContentIndex], updatedContentIndex);
    if (call) calls.push(call);
  }

  return {
    kind: "assistant",
    timestamp: Number(value.timestamp),
    calls,
    ...(interruption ? { interruption } : {})
  };
}
