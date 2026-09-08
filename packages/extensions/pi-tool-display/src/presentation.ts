import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import { displayText } from "./layout.ts";

export type ToolFamily = "read" | "search" | "list" | "shell" | "edit" | "write" | "invocation";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function stringField(value: unknown): string {
  return typeof value === "string" ? displayText(value) : "";
}

export function toolFamily(name: string): ToolFamily {
  switch (name) {
    case "read":
      return "read";
    case "grep":
    case "find":
      return "search";
    case "ls":
      return "list";
    case "bash":
    case "powershell":
      return "shell";
    case "edit":
      return "edit";
    case "write":
      return "write";
    default:
      return "invocation";
  }
}

function readRange(args: Record<string, unknown>): string {
  if (args.offset === undefined && args.limit === undefined) return "";
  const offset = typeof args.offset === "number" ? args.offset : 1;
  const end = typeof args.limit === "number" ? `-${offset + args.limit - 1}` : "";
  return `:${offset}${end}`;
}

export function invocationDetail(name: string, input: unknown, family: ToolFamily): string {
  const args = record(input);
  const path = stringField(args.path ?? args.file_path);
  switch (family) {
    case "shell": {
      const timeout = typeof args.timeout === "number" ? ` (timeout ${args.timeout}s)` : "";
      return (stringField(args.command) || "…") + timeout;
    }
    case "search": {
      const glob = stringField(args.glob);
      return `${stringField(args.pattern) || "…"} in ${path || "."}${glob ? ` (${glob})` : ""}`;
    }
    case "list":
      return path || ".";
    case "read":
      return (path || "…") + readRange(args);
    case "edit":
    case "write":
      return path || "…";
    case "invocation":
      return `${name}(${displayText(JSON.stringify(args))})`;
  }
}

export function resultText(result: AgentToolResult<unknown>): string {
  return result.content
    .map((block) =>
      block.type === "text" ? displayText(block.text) : `[Image: ${displayText(block.mimeType)}]`,
    )
    .join("\n")
    .replace(/\n+$/, "");
}

/** Backend omissions remain visible even when the successful read body is collapsed. */
export function resultNotices(details: unknown): string[] {
  const data = record(details);
  const truncation = record(data.truncation);
  const notices: string[] = [];
  if (truncation.truncated === true) {
    notices.push("Tool output truncated by pi; expand to inspect retained output.");
  }
  if (typeof data.fullOutputPath === "string") {
    notices.push(`Saved output: ${displayText(data.fullOutputPath)}`);
  }
  if (typeof data.matchLimitReached === "number") notices.push("Match limit reached.");
  if (typeof data.resultLimitReached === "number") notices.push("Result limit reached.");
  if (typeof data.entryLimitReached === "number") notices.push("Entry limit reached.");
  if (data.linesTruncated === true) notices.push("Long result lines truncated by pi.");
  return notices;
}

export function diffStatistics(diff: string): string {
  let added = 0;
  let removed = 0;
  // Pi's structured diff uses a leading sign followed by the source line number.
  for (const line of diff.split("\n")) {
    if (/^\+\s*\d/.test(line)) added++;
    if (/^-\s*\d/.test(line)) removed++;
  }
  return `+${added} -${removed}`;
}
