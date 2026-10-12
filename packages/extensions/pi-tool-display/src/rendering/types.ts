import type { ToolDefinition, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { DiffViewTheme } from "@pi-mono/libs/tui/components/diff-view";

import type {
  BorrowedToolResult,
  DisplayCall,
  DisplayCode,
  DisplayGroup,
  DisplayProgress,
  ExplorationItem,
  InvocationPart,
  McpFacts,
  Outcome,
  ResultSummary,
  ToolDisplayAdapter,
  TranscriptView
} from "../contracts.ts";
import type { CallInterpretation, DisplayFailureHandler } from "../interpretation.ts";
import type { PreparedResult } from "./result-content.ts";

export type DisplayTheme = DiffViewTheme;

type HostContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

export type DisplayContext = Omit<HostContext, "args" | "state"> & {
  args: unknown;
  state: unknown;
};

export interface ToolDisplayRenderers {
  renderShell: "self";
  renderCall(args: unknown, theme: DisplayTheme, context: DisplayContext): Component;
  renderResult(
    result: BorrowedToolResult,
    options: ToolRenderResultOptions,
    theme: DisplayTheme,
    context: DisplayContext
  ): Component;
}

export interface DisplayBinding {
  call: DisplayCall;
  coordinator: TranscriptView;
}

export interface ToolDisplayRendererOptions {
  /** Defaults to false. Ignored when the adapter sets `alwaysShowParameters: true`. */
  showParameters?: boolean;
}

export type CardRendererOptions = ToolDisplayRendererOptions & {
  binding?: DisplayBinding;
  /** Reports a standalone card failure once; the row continues generically. */
  onFailure?: DisplayFailureHandler;
};

/** Group-only facts and lookup exist only for a real transcript group. */
export type PreparedGroup = DisplayGroup & {
  readonly exploration: readonly ExplorationItem[];
  readonly interpret: (call: DisplayCall) => CallInterpretation;
};

export type Projection = Readonly<{
  name: string;
  adapter: Readonly<ToolDisplayAdapter>;
  context: Readonly<DisplayContext>;
  theme: DisplayTheme;
  width: number;
  expanded: boolean;
  showParameters: boolean;
  call: DisplayCall | undefined;
  result: BorrowedToolResult | undefined;
  group: PreparedGroup | undefined;
  mcp: McpFacts | undefined;
  outcome: Outcome;
  summary: ResultSummary | undefined;
}>;

/** Lazily prepared, row-owned data. Layout consumers cannot invalidate or replace it. */
export type PreparedCard = Projection &
  Readonly<{
    invocation: readonly InvocationPart[] | undefined;
    code: DisplayCode | undefined;
    headingVerbs: ReturnType<NonNullable<ToolDisplayAdapter["headingVerbs"]>>;
    /** Read once for each card revision; `progress` depends only on arguments and result. */
    progress: DisplayProgress | undefined;
    preparedResult: PreparedResult;
  }>;
