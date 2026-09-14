import type { AgentToolResult, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

import type {
  DisplayCall,
  DisplayGroup,
  ExplorationItem,
  InvocationPart,
  McpFacts,
  ToolDisplayAdapter,
  TranscriptView
} from "../contracts.ts";
import type { TreeItem } from "./layout.ts";

export type DisplayTheme = Pick<Theme, "fg" | "bg" | "getBgAnsi" | "bold">;

type HostContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

export type DisplayContext = Omit<HostContext, "args" | "state"> & {
  args: unknown;
  state: unknown;
};

export interface ToolDisplayRenderers {
  renderShell: "self";
  renderCall(args: unknown, theme: DisplayTheme, context: DisplayContext): Component;
  renderResult(
    result: AgentToolResult<unknown>,
    options: { expanded: boolean; isPartial: boolean },
    theme: DisplayTheme,
    context: DisplayContext
  ): Component;
}

export interface DisplayBinding {
  call: DisplayCall;
  coordinator: TranscriptView;
}

export interface ToolDisplayRendererOptions {
  /** Known adapters hide parameter details by default; generic calls always show arguments. */
  showParameters?: boolean;
}

export type CardRendererOptions = ToolDisplayRendererOptions & { binding?: DisplayBinding };

export type Projection = Readonly<{
  name: string;
  adapter: Readonly<ToolDisplayAdapter>;
  context: Readonly<DisplayContext>;
  theme: DisplayTheme;
  width: number;
  expanded: boolean;
  showParameters: boolean;
  call: DisplayCall | undefined;
  result: AgentToolResult<unknown> | undefined;
  group: DisplayGroup | undefined;
  phase: number;
  mcp: McpFacts | undefined;
}>;

/** Lazily prepared, row-owned data. Layout consumers cannot invalidate or replace it. */
export type PreparedCard = Projection &
  Readonly<{
    invocation: readonly InvocationPart[] | undefined;
    exploration: readonly ExplorationItem[];
    headingVerbs: readonly [pending: string, complete: string] | undefined;
    body: ResultBody;
    hasBody: boolean;
    groupRows: readonly string[];
  }>;

export type ResultBody = Readonly<{
  items: readonly TreeItem[];
  annotations: readonly string[];
}>;
