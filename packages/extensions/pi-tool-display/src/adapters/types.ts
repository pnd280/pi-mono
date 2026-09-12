import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";

import type { ExplorationItem, ToolFamily } from "../display-model.ts";
import type { InvocationPart } from "../presentation.ts";

export type { InvocationPart } from "../presentation.ts";

export interface ResultTextPart {
  kind: "output" | "value" | "annotation" | "warning" | "error";
  text: string;
}
export type DisplayNotice =
  | { kind: "info" | "unavailable" | "warning" | "error"; text: string }
  | { kind: "reference"; label: string; value: string };
export interface ResultTextContext {
  isError: boolean;
  isPartial: boolean;
  hasImages?: boolean;
}
export interface McpFacts {
  server: string;
  tool: string;
  outcome: "transport-error" | "returned-error" | "success" | "unavailable";
  /** References to Pi media blocks avoid retaining a second copy of image bytes. */
  content: (
    | { type: "text"; text: string }
    | { type: "media"; mimeType: string; contentIndex?: number }
    | { type: "resource"; uri: string; text?: string }
  )[];
}
export interface ToolDisplayAdapter {
  id: string;
  family: ToolFamily;
  /** Coordinated calls fall back to generic rendering when retained data fails this contract. */
  supports?(args: unknown, result: AgentToolResult<unknown>): boolean;
  invocation?(args: unknown): InvocationPart[];
  exploration?(args: unknown, result?: AgentToolResult<unknown>): ExplorationItem[] | undefined;
  savedOutput?: boolean;
  patch?: boolean;
  notices?(result: AgentToolResult<unknown>, expanded: boolean): DisplayNotice[];
  textParts?(text: string, args: unknown, context: ResultTextContext): ResultTextPart[];
  /** Identifies a known caption so an adjacent image need not repeat its fallback label. */
  imageCaptionMimeType?(text: string): string | undefined;
  mcp?(args: unknown, result?: AgentToolResult<unknown>): McpFacts | undefined;
}
/** Return a contract only after validating the registered tool's ownership and schema. */
export type ToolDisplayAdapterResolver = (
  tool: ToolInfo | undefined
) => ToolDisplayAdapter | undefined;
