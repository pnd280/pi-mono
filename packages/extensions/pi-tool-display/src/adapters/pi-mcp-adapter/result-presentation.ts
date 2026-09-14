import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import type { DisplayNotice, McpFacts } from "../../contracts.ts";
import { record } from "../../values.ts";

export function mcpCallIdentity(
  result?: AgentToolResult<unknown>
): Pick<McpFacts, "server" | "tool"> | undefined {
  const details = record(result?.details);
  const { server, tool } = details;
  if (
    typeof server !== "string" ||
    !server ||
    typeof tool !== "string" ||
    !tool ||
    (details.mode !== undefined && details.mode !== "call")
  )
    return undefined;

  return { server, tool };
}

export function mcpCallFacts(result?: AgentToolResult<unknown>): McpFacts | undefined {
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
  const guard = record(value);
  if (guard.truncated !== true) return [];
  const notices: DisplayNotice[] = [{ kind: "warning", text: "MCP output truncated." }];
  if (typeof guard.fullOutputPath === "string" && guard.fullOutputPath)
    notices.push({ kind: "reference", label: "Saved output", value: guard.fullOutputPath });
  if (typeof guard.writeError === "string" && guard.writeError)
    notices.push({ kind: "warning", text: `MCP output could not be saved: ${guard.writeError}` });

  return notices;
}

export function mcpNotices(result: AgentToolResult<unknown>, expanded: boolean): DisplayNotice[] {
  const details = record(result.details);
  const notices: DisplayNotice[] = [];

  if (typeof details.error === "string" && details.error) {
    const typedToolError =
      details.error === "tool_error" && result.content.length > 0 && !!mcpCallIdentity(result);
    if (!typedToolError)
      notices.push({
        kind: ["tool_error", "call_failed", "input_required_needs_ui"].includes(details.error)
          ? "error"
          : "warning",
        // call_failed covers caught local errors as well as transport failures.
        text: `MCP: ${details.error}`
      });
  }

  notices.push(...outputNotices(details.outputGuard));

  if (details.mode === "script" && Array.isArray(details.calls)) {
    const failed = details.calls.filter((call: unknown) => record(call).ok === false).length;
    if (failed)
      notices.push({
        kind: "warning",
        text: `${failed} MCP script ${failed === 1 ? "operation" : "operations"} failed.`
      });
  }

  if (expanded) {
    if (typeof details.resourceUri === "string" && details.resourceUri)
      notices.push({ kind: "reference", label: "Resource", value: details.resourceUri });
    const raw = record(details.mcpResult);

    if (raw.omitted === true) {
      notices.push({ kind: "unavailable", text: "Raw MCP result omitted from retained details." });
      if (typeof raw.fullResultPath === "string" && raw.fullResultPath)
        notices.push({ kind: "reference", label: "Saved MCP result", value: raw.fullResultPath });
    }
  }

  return notices;
}
