import { basename } from "node:path";

import type { AgentToolResult, ToolDefinition, ToolInfo } from "@earendil-works/pi-coding-agent";
import { fffAdapter } from "pi-utils/fff-tools";

import type { ExplorationItem, ToolFamily } from "./display-model.ts";
import { record, stringField, invocationParts, type InvocationPart } from "./presentation.ts";
import {
  nativeResultParts,
  fffResultParts,
  fffTextNotices,
  type DisplayNotice,
  type ResultTextContext,
  type ResultTextPart
} from "./result-presentation.ts";
import type { DisplaySettings } from "./settings.ts";

export type { InvocationPart } from "./presentation.ts";
export type { DisplayNotice, ResultTextContext, ResultTextPart } from "./result-presentation.ts";

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
  invocation?(args: unknown): InvocationPart[];
  exploration?(args: unknown, result?: AgentToolResult<unknown>): ExplorationItem[] | undefined;
  savedOutput?: boolean;
  patch?: boolean;
  notices?(result: AgentToolResult<unknown>, expanded: boolean): DisplayNotice[];
  textParts?(text: string, args: unknown, context: ResultTextContext): ResultTextPart[];
  mcp?(args: unknown, result?: AgentToolResult<unknown>): McpFacts | undefined;
}
export const genericAdapter: ToolDisplayAdapter = { id: "generic", family: "invocation" };
const nativeFamilies: Readonly<Record<string, ToolFamily>> = {
  read: "read",
  grep: "search",
  find: "search",
  ls: "list",
  bash: "shell",
  powershell: "shell",
  edit: "edit",
  write: "write"
};
/** Explicit contract assertion for owners; this function does not establish native ownership. */
export function nativeAdapter(name: string): ToolDisplayAdapter | undefined {
  const family = Object.hasOwn(nativeFamilies, name) ? nativeFamilies[name] : undefined;
  if (!family) return undefined;
  return {
    id: `pi:${name}`,
    family,
    savedOutput: family === "shell",
    patch: family === "edit",
    textParts: (text, args, context) => nativeResultParts(name, text, args, context),
    ...(family === "read" || family === "search" || family === "list"
      ? {
          exploration(args: unknown) {
            const data = record(args);
            if (family === "read" && typeof data.path !== "string") return undefined;
            if (family === "search" && typeof data.pattern !== "string") return undefined;
            return [
              {
                label:
                  family === "read"
                    ? ("Read" as const)
                    : family === "search"
                      ? ("Search" as const)
                      : ("List" as const),
                text:
                  family === "read"
                    ? basename(stringField(data.path).replaceAll("\\", "/"))
                    : invocationParts(name, args, family)
                        .map((part) => part.text)
                        .join("")
              }
            ];
          }
        }
      : {})
  };
}
export function officialFffAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  const kind = fffAdapter(tool);
  if (!kind || !tool) return undefined;
  const properties = record(record(tool.parameters).properties);
  if (
    record(properties[kind === "multi" ? "patterns" : "pattern"]).type !==
    (kind === "multi" ? "array" : "string")
  )
    return undefined;
  return {
    id: `fff:${kind}`,
    family: "search",
    ...(kind === "multi"
      ? {
          invocation(args: unknown) {
            const data = record(args);
            return invocationParts(
              tool.name,
              {
                pattern: Array.isArray(data.patterns)
                  ? data.patterns.map(stringField).join(", ")
                  : "",
                path: data.constraints
              },
              "search"
            );
          }
        }
      : {}),
    textParts: (text, _args, context) => fffResultParts(text, kind, context),
    exploration(args, result) {
      const data = record(args);
      if (
        kind === "multi"
          ? !Array.isArray(data.patterns) || !data.patterns.every((p) => typeof p === "string")
          : typeof data.pattern !== "string"
      )
        return undefined;
      const details = record(result?.details);
      if (
        result &&
        Object.keys(details).length &&
        ![details.totalMatched, details.totalFiles].every(
          (value) => typeof value === "number" && Number.isFinite(value)
        )
      )
        return undefined;
      const pattern =
        kind === "multi" ? (data.patterns as string[]).join(", ") : stringField(data.pattern);
      const scope = stringField(kind === "multi" ? data.constraints : data.path);
      return [{ label: "Search", text: `${pattern}${scope ? ` in ${scope}` : ""}` }];
    },
    notices(result, expanded) {
      const details = record(result.details);
      const notices = expanded ? [] : fffTextNotices(result, kind);
      if (expanded && typeof details.totalMatched === "number")
        notices.push({
          kind: "info",
          text: `${details.totalMatched} ${details.totalMatched === 1 ? "match" : "matches"} reported${typeof details.totalFiles === "number" ? ` across ${details.totalFiles} ${details.totalFiles === 1 ? "file" : "files"}` : ""}.`
        });
      if (
        kind === "find" &&
        typeof details.pageIndex === "number" &&
        (expanded || (details.hasMore === true && notices.length === 0))
      )
        notices.push({
          kind: details.hasMore === true ? "warning" : "info",
          text: `Page ${details.pageIndex + 1}${details.hasMore === true ? "; more results available" : ""}.`
        });
      return notices;
    }
  };
}
export function selectAdapter(
  settings: DisplaySettings,
  name: string,
  original: Pick<ToolDefinition, "renderCall" | "renderResult"> | undefined,
  native: boolean,
  info?: ToolInfo
): ToolDisplayAdapter | undefined {
  const mode = settings.valid ? (settings.rendererOverrides[name] ?? "auto") : "original";
  if (mode === "original") return undefined;
  if (mode === "generic") return genericAdapter;
  if (native) return nativeAdapter(name) ?? genericAdapter;
  // The official FFF integration explicitly selects this display despite FFF's own slots.
  const fff = officialFffAdapter(info);
  if (fff) return fff;
  return original?.renderCall || original?.renderResult ? undefined : genericAdapter;
}
