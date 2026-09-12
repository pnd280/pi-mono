import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";
import { fffAdapter, type FffToolKind } from "@pi-mono/utils/fff-tools";

import { record, stringField, invocationParts } from "../../presentation.ts";
import type { ToolDisplayAdapter } from "../types.ts";
import { fffResultParts, fffTextNotices } from "./result-presentation.ts";

function supportsFffCall(
  kind: FffToolKind,
  args: unknown,
  result?: AgentToolResult<unknown>
): boolean {
  const data = record(args);
  if (
    kind === "multi"
      ? !Array.isArray(data.patterns) ||
        !data.patterns.every((pattern) => typeof pattern === "string")
      : typeof data.pattern !== "string"
  )
    return false;
  const details = record(result?.details);
  return (
    !result ||
    !Object.keys(details).length ||
    [details.totalMatched, details.totalFiles].every(
      (value) => typeof value === "number" && Number.isFinite(value)
    )
  );
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
    supports: (args, result) => supportsFffCall(kind, args, result),
    invocation(args) {
      const data = record(args);
      return invocationParts(
        tool.name,
        kind === "multi"
          ? {
              pattern: Array.isArray(data.patterns)
                ? data.patterns.map(stringField).join(", ")
                : "",
              path: data.constraints
            }
          : args,
        "search"
      ).map((part, index) => {
        if (index === 0 && part.kind === "value") return { ...part, kind: "pattern" };
        return part.kind === "path" ? { ...part, kind: "value" } : part;
      });
    },
    textParts: (text, _args, context) => fffResultParts(text, kind, context),
    exploration(args, result) {
      if (!supportsFffCall(kind, args, result)) return undefined;
      const data = record(args);
      const pattern =
        kind === "multi" ? (data.patterns as string[]).join(", ") : stringField(data.pattern);
      const scope = stringField(kind === "multi" ? data.constraints : data.path);
      return [
        {
          label: "Search",
          parts: [
            { kind: "pattern", text: pattern },
            ...(scope
              ? [
                  { kind: "annotation" as const, text: " in " },
                  { kind: "value" as const, text: scope }
                ]
              : [])
          ]
        }
      ];
    },
    notices(result, expanded) {
      const details = record(result.details);
      const notices = expanded ? [] : fffTextNotices(result, kind);
      if (expanded && typeof details.totalMatched === "number")
        notices.push({
          kind: "info",
          text: `${details.totalMatched} ${details.totalMatched === 1 ? "match" : "matches"} reported${typeof details.totalFiles === "number" ? ` across ${details.totalFiles} ${details.totalFiles === 1 ? "file" : "files"}` : ""}.`
        });
      return notices;
    }
  };
}
