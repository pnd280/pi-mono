import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";

import type { OutputText } from "./output-text.ts";

export type ToolFamily = "read" | "search" | "list" | "shell" | "edit" | "write" | "invocation";

export type CallReference = {
  /** Entry IDs are retained on forks; timestamp/index also locate compaction retained tails. */
  readonly messageEntryId?: string;
  readonly messageTimestamp: number;
  readonly contentIndex: number;
  readonly toolCallId: string;
};

export type Lifecycle = "preparing" | "queued" | "executing" | "complete" | "unavailable";

export type Outcome = "success" | "failure" | "cancelled" | "unavailable";

export type OperationFact = {
  readonly kind: "operation";
  readonly availability: "available";
  readonly durationMs: number;
  readonly outcome: Outcome;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
};

export type ChangeFact = {
  readonly kind: "change";
  readonly availability: "available" | "unavailable";
  readonly patch?: string;
  readonly change?: "creation" | "modification";
  readonly reason?: string;
};

export type SavedOutputFact = {
  readonly kind: "saved-output";
  readonly availability: "available";
  readonly path: string;
};

export type DisplayFact = OperationFact | ChangeFact | SavedOutputFact;

export type SavedOutput = Readonly<Partial<OutputText>> & {
  readonly path: string;
  readonly notice?: string | undefined;
  /** Transient capacity failures may be retried on the next expansion. */
  readonly retryable?: boolean;
};

/** Borrowed read-only call view. Only the transcript coordinator changes call state. */
export type DisplayCall = {
  readonly key: string;
  readonly reference: CallReference;
  readonly name: string;
  readonly args: unknown;
  readonly adapter: ToolDisplayAdapter;
  readonly origin: "live" | "historical";
  readonly lifecycle: Lifecycle;
  readonly outcome: Outcome;
  readonly result?: AgentToolResult<unknown>;
  readonly operation?: OperationFact;
  readonly change?: ChangeFact;
  readonly savedPath?: string;
  readonly savedOutput?: SavedOutput;
  readonly liveOutput?: Readonly<OutputText> | undefined;
  readonly expanded: boolean;
  readonly revision: number;
};

export type InvocationPart = {
  kind: "value" | "path" | "pattern" | "annotation" | "parameters";
  text: string;
};

export type ExplorationItem = {
  label: "Read" | "Search" | "List";
  parts: InvocationPart[];
};

export type DisplayGroup = {
  readonly members: readonly DisplayCall[];
  readonly expanded: boolean;
};

/** Rendering reads state and submits expansion intents without owning transcript updates. */
export interface TranscriptView {
  readonly calls: ReadonlyMap<string, DisplayCall>;
  readonly phase: number;
  group(call: DisplayCall): DisplayGroup | undefined;
  expand(call: DisplayCall, expanded: boolean): void;
}

export type ResultTextPart = {
  kind: "output" | "value" | "annotation" | "warning" | "error";
  text: string;
};

export type DisplayNotice =
  | { kind: "info" | "unavailable" | "warning" | "error"; text: string }
  | { kind: "reference"; label: string; value: string };

export type ResultTextContext = {
  isError: boolean;
  isPartial: boolean;
  hasImages?: boolean;
};

export type McpFacts = {
  server: string;
  tool: string;
  outcome: "transport-error" | "returned-error" | "success" | "unavailable";
  /** References to Pi media blocks avoid retaining a second copy of image bytes. */
  content: (
    | { type: "text"; text: string }
    | { type: "media"; mimeType: string; contentIndex?: number }
    | { type: "resource"; uri: string; text?: string }
  )[];
};

export type ToolDisplayAdapter = {
  id: string;
  family: ToolFamily;
  /** Coordinated calls fall back to generic rendering when retained data fails this contract. */
  supports?(args: unknown, result: AgentToolResult<unknown>): boolean;
  /** Override action wording without changing result presentation or terminal outcomes. */
  headingVerbs?(args: unknown): readonly [pending: string, complete: string] | undefined;
  invocation?(args: unknown, result?: AgentToolResult<unknown>): InvocationPart[];
  exploration?(args: unknown, result?: AgentToolResult<unknown>): ExplorationItem[] | undefined;
  savedOutput?: boolean;
  patch?: boolean;
  notices?(result: AgentToolResult<unknown>, expanded: boolean): DisplayNotice[];
  textParts?(text: string, args: unknown, context: ResultTextContext): ResultTextPart[];
  /** Identifies a known caption so an adjacent image need not repeat its fallback label. */
  imageCaptionMimeType?(text: string): string | undefined;
  mcp?(args: unknown, result?: AgentToolResult<unknown>): McpFacts | undefined;
};

/** Return a contract only after validating the registered tool's ownership and schema. */
export type ToolDisplayAdapterResolver = (
  tool: ToolInfo | undefined
) => ToolDisplayAdapter | undefined;

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

export function isCancelled(call: DisplayCall): boolean {
  return call.outcome === "cancelled" || call.operation?.outcome === "cancelled";
}
