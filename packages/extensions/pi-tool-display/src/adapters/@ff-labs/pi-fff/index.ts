import type { AgentToolResult, ToolInfo } from "@earendil-works/pi-coding-agent";
import { fffAdapter, type FffToolKind } from "@pi-mono/utils/fff-tools";
import { z } from "zod";

import { type InvocationPart } from "../../../contracts.ts";
import type { ToolDisplayAdapter } from "../../../contracts.ts";
import { invocationParts } from "../../../invocation.ts";
import { stringField } from "../../../terminal-text.ts";
import { record } from "../../../values.ts";
import { fffResultParts, fffTextNotices } from "./result-presentation.ts";

const patternsSchema = z.array(z.string());
const argumentSchemas = {
  multi: z.object({ patterns: patternsSchema }),
  find: z.object({ pattern: z.string() }),
  grep: z.object({ pattern: z.string() })
};
const countsSchema = z.object({ totalMatched: z.number(), totalFiles: z.number() });
const noticeCountsSchema = z.object({
  totalMatched: z.number().optional().catch(undefined),
  totalFiles: z.number().optional().catch(undefined)
});
const registrationSchemas = {
  multi: z.object({ properties: z.object({ patterns: z.object({ type: z.literal("array") }) }) }),
  find: z.object({ properties: z.object({ pattern: z.object({ type: z.literal("string") }) }) }),
  grep: z.object({ properties: z.object({ pattern: z.object({ type: z.literal("string") }) }) })
};

function supportsFffCall(
  kind: FffToolKind,
  args: unknown,
  result?: AgentToolResult<unknown>
): boolean {
  if (!argumentSchemas[kind].safeParse(args).success) return false;
  const details = record(result?.details);

  return !result || !Object.keys(details).length || countsSchema.safeParse(details).success;
}

function patternPart(kind: FffToolKind, pattern: unknown): InvocationPart {
  if (typeof pattern !== "string") return { kind: "annotation", text: "(pattern missing)" };
  if (kind === "find" && pattern === "") return { kind: "annotation", text: "files" };

  return { kind: "pattern", text: pattern === "" ? '""' : stringField(pattern) };
}

export function piFffAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  const kind = fffAdapter(tool);
  if (!kind || !tool) return undefined;
  if (!registrationSchemas[kind].safeParse(tool.parameters).success) return undefined;

  return {
    id: `@ff-labs/pi-fff:${kind}`,
    family: "search",
    supports: (args, result) => supportsFffCall(kind, args, result),
    headingVerbs: (args) =>
      kind === "find" && record(args).pattern === ""
        ? { action: "List", pending: "Listing", complete: "Listed" }
        : undefined,
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
      const patterns = patternsSchema.safeParse(data.patterns).data;

      return [
        {
          label: listing ? "List" : "Search",
          parts: [
            kind === "multi" && patterns
              ? { kind: "pattern", text: patterns.join(", ") }
              : patternPart(kind, data.pattern),
            { kind: "annotation", text: " in " },
            { kind: "value", text: scope }
          ]
        }
      ];
    },
    notices(result, expanded) {
      const details = noticeCountsSchema.safeParse(result.details).data;
      const notices = expanded ? [] : fffTextNotices(result, kind);
      if (expanded && details?.totalMatched !== undefined)
        notices.push({
          kind: "info",
          text: `${details.totalMatched} ${details.totalMatched === 1 ? "match" : "matches"} reported${details.totalFiles !== undefined ? ` across ${details.totalFiles} ${details.totalFiles === 1 ? "file" : "files"}` : ""}.`
        });

      return notices;
    }
  };
}
