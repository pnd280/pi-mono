import type {
  BorrowedToolResult,
  DisplayNotice,
  McpFacts,
  Outcome,
  ResultSummary
} from "../../contracts.ts";
import { record } from "../../values.ts";
import {
  callIdentitySchema,
  failedScriptCallSchema,
  noticeDetailsSchema,
  omittedResultSchema,
  outputGuardSchema,
  scriptSummarySchema
} from "./schemas.ts";

export function mcpCallIdentity(
  result?: BorrowedToolResult
): Pick<McpFacts, "server" | "tool"> | undefined {
  const parsed = callIdentitySchema.safeParse(result?.details);
  if (!parsed.success) return undefined;
  const { server, tool } = parsed.data;

  return { server, tool };
}

export function mcpResultOutcome(result: BorrowedToolResult): Outcome | undefined {
  const details = noticeDetailsSchema.safeParse(result.details).data;
  if (details?.error === "aborted") return "cancelled";
  if (
    details?.error &&
    (["tool_error", "call_failed", "input_required_needs_ui"].includes(details.error) ||
      (details.mode === "script" && ["script_error", "timeout"].includes(details.error)))
  )
    return "failure";

  return undefined;
}

export function mcpCallFacts(result?: BorrowedToolResult): McpFacts | undefined {
  const identity = mcpCallIdentity(result);
  if (!identity || !result || !result.content.length) return undefined;
  const details = record(result.details);
  if (details.error !== undefined && details.error !== "tool_error") return undefined;

  // Pi content is the published, output-guarded result. Raw mcpResult can contain
  // omitted output or pre-middleware data; never resurrect it or copy image bytes.
  return {
    ...identity,
    outcome: details.error === "tool_error" ? "returned-error" : "success",
    content: result.content.map((block, contentIndex) =>
      block.type === "text"
        ? { type: "text", text: block.text }
        : { type: "media", mimeType: block.mimeType, contentIndex }
    )
  };
}

function outputNotices(value: unknown): DisplayNotice[] {
  const parsed = outputGuardSchema.safeParse(value);
  if (!parsed.success) return [];
  const guard = parsed.data;
  const notices: DisplayNotice[] = [{ kind: "warning", text: "MCP output truncated." }];
  if (guard.fullOutputPath)
    notices.push({ kind: "reference", label: "Saved output", value: guard.fullOutputPath });
  if (guard.writeError)
    notices.push({ kind: "warning", text: `MCP output could not be saved: ${guard.writeError}` });

  return notices;
}

export function mcpScriptSummary(
  result: BorrowedToolResult,
  { outcome }: { outcome: Outcome }
): ResultSummary | undefined {
  const details = scriptSummarySchema.safeParse(result.details).data;
  if (!details) return undefined;
  const count = details.calls.length;
  const succeeded = outcome === "success" && count > 0 && details.calls.every((call) => call.ok);

  return {
    text: `${count} MCP ${count === 1 ? "operation" : "operations"}${succeeded ? " succeeded" : ""}`,
    // Preserve emitted diagnostics when any nested operation failed or is unfinished.
    preserveOutput: !succeeded
  };
}

export function mcpNotices(result: BorrowedToolResult, expanded: boolean): DisplayNotice[] {
  const details = noticeDetailsSchema.safeParse(result.details).data;
  if (!details) return [];
  const notices: DisplayNotice[] = [];

  if (details.error) {
    const typedToolError =
      details.error === "tool_error" && result.content.length > 0 && !!mcpCallIdentity(result);
    if (!typedToolError)
      notices.push({
        kind: mcpResultOutcome(result) === "failure" ? "error" : "warning",
        // call_failed covers caught local errors as well as transport failures.
        text: `MCP: ${details.error}`
      });
  }

  notices.push(...outputNotices(details.outputGuard));

  if (details.mode === "script" && details.calls) {
    const unsuccessful = details.calls.flatMap((call) => {
      const parsed = failedScriptCallSchema.safeParse(call).data;

      return parsed ? [parsed] : [];
    });
    const unfinished = unsuccessful.filter((call) => call.error === "incomplete").length;
    const failed = unsuccessful.length - unfinished;
    for (const [count, status] of [
      [failed, "failed"],
      [unfinished, "unfinished"]
    ] as const)
      if (count)
        notices.push({
          kind: "warning",
          text: `${count} MCP script ${count === 1 ? "operation" : "operations"} ${status}.`
        });
  }

  if (expanded) {
    if (details.resourceUri)
      notices.push({ kind: "reference", label: "Resource", value: details.resourceUri });
    const raw = omittedResultSchema.safeParse(details.mcpResult).data;

    if (raw) {
      notices.push({ kind: "unavailable", text: "Raw MCP result omitted from retained details." });
      if (raw.fullResultPath)
        notices.push({ kind: "reference", label: "Saved MCP result", value: raw.fullResultPath });
    }
  }

  return notices;
}
