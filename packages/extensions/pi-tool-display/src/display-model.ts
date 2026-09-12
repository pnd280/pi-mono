import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import type { ToolDisplayAdapter } from "./adapters.ts";
import type { OutputText } from "./output-text.ts";
import type { InvocationPart } from "./presentation.ts";

export type ToolFamily = "read" | "search" | "list" | "shell" | "edit" | "write" | "invocation";
export interface CallReference {
  /** Entry IDs are retained on forks; timestamp/index also locate compaction retained tails. */
  messageEntryId?: string;
  messageTimestamp: number;
  contentIndex: number;
  toolCallId: string;
}
export type Lifecycle = "preparing" | "queued" | "executing" | "complete" | "unavailable";
export type Outcome = "success" | "failure" | "cancelled" | "unavailable";
export interface OperationFact {
  kind: "operation";
  availability: "available";
  durationMs: number;
  outcome: Outcome;
  exitCode?: number | null;
  timedOut?: boolean;
}
export interface ChangeFact {
  kind: "change";
  availability: "available" | "unavailable";
  patch?: string;
  change?: "creation" | "modification";
  reason?: string;
}
export interface SavedOutputFact {
  kind: "saved-output";
  availability: "available";
  path: string;
}
export type DisplayFact = OperationFact | ChangeFact | SavedOutputFact;
export interface SavedOutput extends Partial<OutputText> {
  path: string;
  notice?: string | undefined;
  /** Transient capacity failures may be retried on the next expansion. */
  retryable?: boolean;
}
export interface DisplayCall {
  key: string;
  reference: CallReference;
  name: string;
  args: unknown;
  adapter: ToolDisplayAdapter;
  origin: "live" | "historical";
  lifecycle: Lifecycle;
  outcome: Outcome;
  result?: AgentToolResult<unknown>;
  operation?: OperationFact;
  change?: ChangeFact;
  savedPath?: string;
  savedOutput?: SavedOutput;
  liveOutput?: OutputText | undefined;
  expanded: boolean;
  revision: number;
}
export interface ExplorationItem {
  label: "Read" | "Search" | "List";
  parts: InvocationPart[];
}
export interface DisplayGroup {
  members: DisplayCall[];
  expanded: boolean;
}
export function callKey(runtime: string, reference: CallReference): string {
  return JSON.stringify([
    runtime,
    reference.messageTimestamp,
    reference.contentIndex,
    reference.toolCallId
  ]);
}
export function isLive(call: DisplayCall): boolean {
  return call.origin === "live" && ["preparing", "queued", "executing"].includes(call.lifecycle);
}
