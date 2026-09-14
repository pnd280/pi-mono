import type { AgentToolResult, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

import type {
  DisplayCall,
  DisplayGroup,
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

export interface Projection {
  name: string;
  adapter: ToolDisplayAdapter;
  context: DisplayContext;
  theme: DisplayTheme;
  width: number;
  expanded: boolean;
  showParameters: boolean;
  call: DisplayCall | undefined;
  result: AgentToolResult<unknown> | undefined;
  group: DisplayGroup | undefined;
  phase: number;
  row: RowState;
}

export interface RowState {
  result?: AgentToolResult<unknown>;
  body?:
    | { projection: Projection; result: AgentToolResult<unknown>; value: ResultBody }
    | undefined;
}

export interface ResultBody {
  items: TreeItem[];
  annotations: string[];
}
