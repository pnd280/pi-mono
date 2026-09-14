import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";
import { fffAdapter, type FffToolKind } from "@pi-mono/utils/fff-tools";

import { type InvocationPart } from "../../../contracts.ts";
import type { ToolDisplayAdapter } from "../../../contracts.ts";
import { invocationParts } from "../../../invocation.ts";
import { stringField } from "../../../terminal-text.ts";
import { record } from "../../../values.ts";
import { fffResultParts, fffTextNotices } from "./result-presentation.ts";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((pattern: unknown) => typeof pattern === "string");
}

function supportsFffCall(
  kind: FffToolKind,
  args: unknown,
  result?: AgentToolResult<unknown>
): boolean {
  const data = record(args);
  if (kind === "multi" ? !isStringArray(data.patterns) : typeof data.pattern !== "string")
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

function patternPart(kind: FffToolKind, pattern: unknown): InvocationPart {
  if (typeof pattern !== "string") return { kind: "annotation", text: "(pattern missing)" };
  if (kind === "find" && pattern === "") return { kind: "annotation", text: "files" };

  return { kind: "pattern", text: pattern === "" ? '""' : stringField(pattern) };
}

export function piFffAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  const kind = fffAdapter(tool);
  if (!kind || !tool) return undefined;
  const properties = record(record(tool.parameters).properties);
  if (
    record(properties[kind === "multi" ? "patterns" : "pattern"]).type !==
    (kind === "multi" ? "array" : "string")
  )
    return undefined;

  return {
    id: `@ff-labs/pi-fff:${kind}`,
    family: "search",
    supports: (args, result) => supportsFffCall(kind, args, result),
    headingVerbs: (args) =>
      kind === "find" && record(args).pattern === "" ? ["Listing", "Listed"] : undefined,
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
        if (index === 0 && kind !== "multi") return patternPart(kind, data.pattern);
        if (index === 0 && part.kind === "value") return { ...part, kind: "pattern" };

        return part.kind === "path" ? { ...part, kind: "value" } : part;
      });
    },
    textParts: (text, _args, context) => fffResultParts(text, kind, context),
    exploration(args, result) {
      if (!supportsFffCall(kind, args, result)) return undefined;
      const data = record(args);
      const listing = kind === "find" && data.pattern === "";
      const scope = stringField(kind === "multi" ? data.constraints : data.path) || ".";

      return [
        {
          label: listing ? "List" : "Search",
          parts: [
            kind === "multi" && isStringArray(data.patterns)
              ? { kind: "pattern", text: data.patterns.join(", ") }
              : patternPart(kind, data.pattern),
            { kind: "annotation", text: " in " },
            { kind: "value", text: scope }
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
