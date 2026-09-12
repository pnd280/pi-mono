import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import type { ToolFamily, DisplayGroup, ExplorationItem } from "./display-model.ts";
import { displayText } from "./layout.ts";
import type { DisplayNotice } from "./result-presentation.ts";
export type { ToolFamily } from "./display-model.ts";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function stringField(value: unknown): string {
  return typeof value === "string" ? displayText(value) : "";
}

function readRange(args: Record<string, unknown>): string {
  if (args.offset === undefined && args.limit === undefined) return "";
  const offset = typeof args.offset === "number" ? args.offset : 1;
  const end = typeof args.limit === "number" ? `-${offset + args.limit - 1}` : "";
  return `:${offset}${end}`;
}

export interface InvocationPart {
  kind: "value" | "annotation" | "parameters";
  text: string;
}
const value = (text: string): InvocationPart => ({ kind: "value", text });
const annotation = (text: string): InvocationPart => ({ kind: "annotation", text });

/** Keep supplied values separate from generated labels; styling must not parse user text. */
export function invocationParts(
  name: string,
  input: unknown,
  family: ToolFamily
): InvocationPart[] {
  const args = record(input);
  const path = stringField(args.path ?? args.file_path);
  switch (family) {
    case "shell": {
      const timeout = typeof args.timeout === "number" ? ` (timeout ${args.timeout}s)` : "";
      const command = stringField(args.command);
      return [command ? value(command) : annotation("…"), annotation(timeout)];
    }
    case "search": {
      const glob = stringField(args.glob);
      return [
        stringField(args.pattern) ? value(stringField(args.pattern)) : annotation("…"),
        annotation(" in "),
        value(path || "."),
        ...(glob ? [annotation(" ("), value(glob), annotation(")")] : [])
      ];
    }
    case "list":
      return [value(path || ".")];
    case "read":
      return [path ? value(path) : annotation("…"), annotation(readRange(args))];
    case "edit":
    case "write":
      return [path ? value(path) : annotation("…")];
    case "invocation":
      return [
        value(name),
        annotation("("),
        { kind: "parameters", text: displayText(JSON.stringify(args)) },
        annotation(")")
      ];
  }
}

export function resultText(result: AgentToolResult<unknown>): string {
  return result.content
    .map((block) =>
      block.type === "text" ? displayText(block.text) : `[Image: ${displayText(block.mimeType)}]`
    )
    .join("\n")
    .replace(/\n+$/, "");
}

/** Backend omissions remain visible even when the successful read body is collapsed. */
export function resultNotices(details: unknown): DisplayNotice[] {
  const data = record(details);
  const truncation = record(data.truncation);
  const notices: DisplayNotice[] = [];
  const warning = (text: string) => notices.push({ kind: "warning", text });
  if (truncation.truncated === true)
    warning("Tool output truncated by pi; expand to inspect retained output.");
  if (typeof data.fullOutputPath === "string") {
    notices.push({
      kind: "reference",
      label: "Saved output",
      value: displayText(data.fullOutputPath)
    });
  }
  if (typeof data.matchLimitReached === "number") warning("Match limit reached.");
  if (typeof data.resultLimitReached === "number") warning("Result limit reached.");
  if (typeof data.entryLimitReached === "number") warning("Entry limit reached.");
  if (data.linesTruncated === true) warning("Long result lines truncated by pi.");
  return notices;
}

export function explorationSummary(group: DisplayGroup): ExplorationItem[] {
  const summary: ExplorationItem[] = [];
  let reads: string[] = [];
  const flush = () => {
    if (reads.length) summary.push({ label: "Read", text: [...new Set(reads)].join(", ") });
    reads = [];
  };
  for (const call of group.members) {
    const items = call.adapter.exploration?.(call.args, call.result) ?? [];
    if (items.length && items.every((item) => item.label === "Read"))
      reads.push(...items.map((item) => item.text));
    else {
      flush();
      summary.push(...items);
    }
  }
  flush();
  return summary;
}
