import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";
import type { CodeSelectionRange } from "@pi-mono/libs/tui/components/code-highlight";
import type { OutputText } from "@pi-mono/utils/output-text";

export type ToolFamily = "read" | "search" | "list" | "shell" | "edit" | "write" | "invocation";

export type CallReference = {
  /** Entry IDs are retained on forks; timestamp/index also locate compaction retained tails. */
  readonly messageEntryId?: string | undefined;
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
  readonly exitCode?: number | null | undefined;
  readonly timedOut?: boolean | undefined;
};

export type ChangeFact = {
  readonly kind: "change";
  readonly availability: "available" | "unavailable";
  readonly patch?: string | undefined;
  readonly change?: "creation" | "modification" | undefined;
  readonly reason?: string | undefined;
};

export type SavedOutputFact = {
  readonly kind: "saved-output";
  readonly availability: "available";
  readonly path: string;
};

export type CancellationFact = {
  readonly kind: "cancellation";
  readonly availability: "available";
};

export type DisplayFact = OperationFact | ChangeFact | SavedOutputFact | CancellationFact;

type DeepReadonly<Value> = Value extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

/** Pi-owned result view exposed to adapters and renderers without mutation rights. */
export type BorrowedToolResult = DeepReadonly<AgentToolResult<unknown>>;

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
  readonly result?: BorrowedToolResult;
  readonly operation?: OperationFact;
  readonly cancellation?: CancellationFact;
  readonly change?: ChangeFact;
  readonly savedPath?: string;
  readonly savedOutput?: SavedOutput;
  readonly liveOutput?: Readonly<OutputText> | undefined;
  readonly expanded: boolean;
  readonly revision: number;
};

export type InvocationPart = {
  /**
   * Use `path` for concrete file targets, which render relative to Pi's cwd when
   * inside it (or relative to the directory scope in collapsed groups). Use
   * `value` for literal filters and `pattern` for search patterns.
   * A `range` following a concrete `path` stays together when wrapping the target.
   * With `showParameters: false`, only `parameters` parts are hidden unless the
   * adapter sets `alwaysShowParameters: true`. Include optional delimiters in the same
   * part so hiding it leaves no empty punctuation.
   */
  kind: "value" | "path" | "range" | "pattern" | "annotation" | "parameters";
  text: string;
};

export type ExplorationScope = {
  /** File targets group by their parent; filters are compared literally, never resolved. */
  kind: "file" | "directory" | "filter";
  value: string;
};

export type ExplorationItem = {
  parts: InvocationPart[];
  /** Omission excludes the call from grouping. All items must have the same scope. */
  scope?: ExplorationScope;
};

export type DisplayGroup = {
  readonly members: readonly DisplayCall[];
  readonly expanded: boolean;
  readonly scope: ExplorationScope;
  /** Custom heading for adapter-defined tool groups; exploration groups omit it. */
  readonly title?: string | undefined;
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
  /** Expanded read output only: zero-based lines and UTF-16 offsets in this part's raw text. */
  selection?: readonly CodeSelectionRange[];
};

export type DisplayNotice =
  | { kind: "info" | "unavailable" | "warning" | "error"; text: string }
  | { kind: "reference"; label: string; value: string };

export type ResultSummary = {
  text: string;
  /** Supplement the output preview when these facts do not summarize its content. */
  preserveOutput?: boolean;
};

export type ResultTextContext = {
  /** Borrowed result and the index of the current text block within its content. */
  result: BorrowedToolResult;
  contentIndex: number;
  isError: boolean;
  isPartial: boolean;
  isCancelled: boolean;
  expanded: boolean;
  hasImages?: boolean;
};

export type HeadingVerbs = {
  action: string;
  pending: string;
  complete: string;
};

export type McpFacts = {
  server: string;
  tool: string;
  outcome: "transport-error" | "returned-error" | "cancelled" | "success" | "unavailable";
  /** References to Pi media blocks avoid retaining a second copy of image bytes. */
  content: (
    | { type: "text"; text: string }
    | { type: "media"; mimeType: string; contentIndex?: number }
    | { type: "resource"; uri: string; text?: string }
  )[];
};

/** Callbacks receive borrowed arguments and results; never mutate or persist them. */
export type ToolDisplayAdapter = {
  /** Stable contract ID. `pi:*`, `@ff-labs/pi-fff:*`, `pi-mcp-adapter:*`, and `generic` are reserved. */
  id: string;
  family: ToolFamily;
  /** When true, show parameters regardless of `showParameters`. Otherwise, follow that setting. */
  alwaysShowParameters?: boolean;
  /**
   * Validate retained data in the automatic CLI integration after a result exists,
   * including partial updates. False uses generic rendering and excludes the call
   * from exploration groups; a later supported result restores its presentation.
   * Omission accepts all results. The selected contract and retained data stay
   * unchanged. Standalone factories use their explicit adapter without this check.
   */
  supports?(args: unknown, result: BorrowedToolResult): boolean;
  /**
   * Override the base action, pending, and successful completion verbs. Omission
   * uses the family's verbs. Terminal problems qualify the action ("Write failed").
   */
  headingVerbs?(args: unknown): HeadingVerbs | undefined;
  /**
   * Supply a header when arguments differ from the family's native shape.
   * Arguments remain unmodified by path display formatting. The optional retained
   * result can supply a resolved tool identity.
   */
  invocation?(args: unknown, result?: BorrowedToolResult): InvocationPart[];
  /**
   * Supply ordered group items for the automatic CLI integration. Handle partial
   * arguments before a result exists; undefined, empty items, or missing/mixed scopes
   * exclude the call. Scope runs compare normalized directories or exact literal filters.
   * Result updates can remove or restore membership without changing source order.
   */
  exploration?(args: unknown, result?: BorrowedToolResult): ExplorationItem[] | undefined;
  /**
   * Label collapsed groups that use a literal filter scope with a custom heading,
   * such as "Todos". Exploration groups leave it undefined and name their scope.
   * Calls group only when both their normalized scope and custom title match.
   */
  groupTitle?: string;
  /**
   * Summarize completed results from validated metadata or observed operation facts.
   * Compact successful cards replace text with this summary unless preserveOutput
   * is true. Diagnostics and images stay visible; expansion restores retained text.
   * Missing summaries use the ordinary output preview, including inside groups.
   */
  summary?(
    result: BorrowedToolResult,
    context: {
      args: unknown;
      outcome: Outcome;
      operation: OperationFact | undefined;
      expanded: boolean;
    }
  ): ResultSummary | undefined;
  /** Report a structured result outcome; never infer it from ordinary output text.
   * Cancellation takes precedence over failure, and neither can be downgraded by
   * success or unavailable metadata. Omission uses Pi's outcome and MCP facts.
   */
  outcome?(result: BorrowedToolResult): Outcome | undefined;
  /** Declare details.fullOutputPath meaningful to the CLI; standalone renderers never load it. */
  savedOutput?: boolean;
  /** Interpret successful details.patch as a unified patch, within the retained patch byte limit. */
  patch?: boolean;
  /**
   * Keep diagnostics and references visible in compact and expanded cards, including
   * groups. Severity controls styling, not visibility. Use summary for result totals.
   * `info` uses dim styling, `unavailable` uses muted styling.
   */
  notices?(result: BorrowedToolResult, expanded: boolean): DisplayNotice[];
  /**
   * Interpret a known text envelope using explicit result context, not guessed
   * facts from ordinary output. Preserve content except recognized routine metadata.
   * An empty array hides this block without an empty-output placeholder.
   * Presentation never changes the retained result.
   */
  textParts?(text: string, args: unknown, context: ResultTextContext): ResultTextPart[];
  /**
   * Identify a known caption's MIME type. In complete successful results, a matching
   * adjacent image omits its redundant fallback label; the caption and image stay intact.
   */
  imageCaptionMimeType?(text: string): string | undefined;
  /** Supply typed MCP facts, or undefined when unavailable; never infer lost protocol types. */
  mcp?(args: unknown, result?: BorrowedToolResult): McpFacts | undefined;
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
  return (
    !!call.cancellation || call.outcome === "cancelled" || call.operation?.outcome === "cancelled"
  );
}
