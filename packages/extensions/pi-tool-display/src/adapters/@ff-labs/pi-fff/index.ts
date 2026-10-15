import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { fffAdapter, type FffToolKind } from "@pi-mono/utils/fff-tools";
import { z } from "zod";

import { type InvocationPart } from "../../../contracts.ts";
import type { BorrowedToolResult, ToolDisplayAdapter } from "../../../contracts.ts";
import { invocationParts } from "../../../invocation.ts";
import { record, stringField } from "../../../values.ts";
import { fffResultParts, fffTextNotices } from "./result-presentation.ts";

const patternsSchema = z.array(z.string());
const scopeSchema = z
  .string()
  .optional()
  .transform((value) => value || ".");
const argumentSchemas = {
  multi: z.object({ patterns: patternsSchema }),
  find: z.object({ pattern: z.string() }),
  grep: z.object({ pattern: z.string() })
};
const countsSchema = z.object({ totalMatched: z.number(), totalFiles: z.number() });
const summaryCountsSchema = z.object({
  totalMatched: z.int().nonnegative(),
  totalFiles: z.int().nonnegative()
});
const registrationSchemas = {
  multi: z.object({ properties: z.object({ patterns: z.object({ type: z.literal("array") }) }) }),
  find: z.object({ properties: z.object({ pattern: z.object({ type: z.literal("string") }) }) }),
  grep: z.object({ properties: z.object({ pattern: z.object({ type: z.literal("string") }) }) })
};

function supportsFffCall(kind: FffToolKind, args: unknown, result?: BorrowedToolResult): boolean {
  if (!argumentSchemas[kind].safeParse(args).success) return false;
  const details = record(result?.details);

  return !result || !Object.keys(details).length || countsSchema.safeParse(details).success;
}

function patternPart(kind: FffToolKind, pattern: unknown): InvocationPart {
  if (typeof pattern !== "string") return { kind: "annotation", text: "…" };
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
      const listing = kind === "find" && data.pattern === "";

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
        listing ? "list" : "search"
      ).map((part, index) => {
        if (!listing && index === 0 && kind !== "multi") return patternPart(kind, data.pattern);

        return part.kind === "path" ? { ...part, kind: "value" } : part;
      });
    },
    textParts(text, _args, context) {
      const parts = fffResultParts(text, kind, context);

      // Compact notices own warnings, including standalone scope runs. Expansion
      // restores the text envelope without adding the same notices a second time.
      return context.expanded || context.isPartial || context.isError
        ? parts
        : parts.filter((part) => part.kind !== "warning");
    },
    exploration(args, result) {
      if (!supportsFffCall(kind, args, result)) return undefined;
      const data = record(args);
      const scope = scopeSchema.safeParse(kind === "multi" ? data.constraints : data.path).data;
      const patterns = patternsSchema.safeParse(data.patterns).data;

      return [
        {
          ...(scope !== undefined ? { scope: { kind: "filter" as const, value: scope } } : {}),
          parts: [
            kind === "multi" && patterns
              ? { kind: "pattern", text: patterns.join(", ") }
              : patternPart(kind, data.pattern)
          ]
        }
      ];
    },
    summary(result, { outcome, expanded }) {
      if (outcome !== "success") return undefined;
      const counts = summaryCountsSchema.safeParse(result.details).data;
      if (!counts) return undefined;
      const { totalMatched, totalFiles } = counts;
      // FFF grep counts collected matches, while find counts all matching files.
      // totalFiles is the unfiltered index size, never a count of searched/hit files.
      const matches =
        kind === "find"
          ? `${totalMatched} matching ${totalMatched === 1 ? "file" : "files"}`
          : `${totalMatched} ${totalMatched === 1 ? "match" : "matches"} collected`;

      return {
        text: expanded
          ? `${matches} · ${totalFiles} indexed ${totalFiles === 1 ? "file" : "files"}`
          : matches
      };
    },
    notices: (result, expanded) => (expanded ? [] : fffTextNotices(result, kind))
  };
}
