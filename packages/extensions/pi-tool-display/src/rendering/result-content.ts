import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { getCapabilities } from "@earendil-works/pi-tui";

import {
  isCancelled,
  type McpFacts,
  type DisplayNotice,
  type ResultTextPart
} from "../contracts.ts";
import { parsePatch } from "../diff.ts";
import type { OutputText } from "../output-text.ts";
import { displayText, styledOutput, stringField } from "../terminal-text.ts";
import { record } from "../values.ts";
import { renderDiffBody } from "./diff-view.ts";
import { expansionHint, highlight, output, message, reference } from "./format.ts";
import { bodyWidth, wrapRows } from "./layout.ts";
import type { Projection, ResultBody } from "./types.ts";

// Mutable only while preparing a body; cards expose read-only measured items.
type TreeItem = { rows: string[] };

export function buildGroupRows(p: Projection): string[] {
  if (!p.call) return [];
  if (!p.result)
    return p.call.lifecycle === "unavailable" ? message("Outcome unavailable", p, "muted") : [];
  const rows: string[] = [];

  if (p.call.outcome === "failure" || isCancelled(p.call)) {
    const diagnostic = p.result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    rows.push(
      ...output(p.theme.fg(isCancelled(p.call) ? "warning" : "error", displayText(diagnostic)), p)
    );
  }

  rows.push(
    ...imageItems(p.result.content, p).flatMap((item) => item.rows),
    ...notices(p.result, p)
  );
  if (p.call.lifecycle === "unavailable") rows.push(...message("Outcome unavailable", p, "muted"));

  return rows;
}

function patchRows(
  patch: string,
  p: Projection,
  annotations: readonly string[]
): string[] | undefined {
  const parsed = parsePatch(patch);
  if (!parsed) return undefined;
  // Preserve +0 -0 for empty patches so a no-op still has visible output.
  const oneSided =
    (parsed.added > 0 && parsed.removed === 0) || (parsed.removed > 0 && parsed.added === 0);
  const rows =
    p.adapter.family === "write" && oneSided
      ? []
      : [
          `${p.theme.fg("toolDiffAdded", `+${parsed.added}`)} ${p.theme.fg("toolDiffRemoved", `-${parsed.removed}`)}`
        ];
  const body = renderDiffBody(parsed, {
    width: bodyWidth(p.width),
    expanded: p.expanded,
    expansionHint: expansionHint(),
    theme: p.theme,
    highlight: (source) => highlight(source, stringField(record(p.context.args).path))
  });
  rows.push(...annotations, ...body);

  return rows;
}

function applicationFailure(p: Projection): string[] {
  const outcome = p.call?.operation?.outcome;
  if (!p.context.isError && outcome !== "failure") return [];

  return message(
    outcome === "success"
      ? "Tool result reports failure after application."
      : "Failed to apply change",
    p,
    p.call && isCancelled(p.call) ? "warning" : "error"
  );
}

function changeRows(
  result: AgentToolResult<unknown>,
  p: Projection
): { rows: string[]; hasPatch: boolean } {
  const patch =
    p.adapter.patch && !p.context.isError ? stringField(record(result.details).patch) : "";
  const proposal = p.call?.change?.patch;
  const rows: string[] = [];
  let renderedPatch: string[] | undefined;

  if (patch || proposal) {
    const unconfirmed =
      !patch && p.call?.operation?.outcome !== "success"
        ? message("Proposed change; application not confirmed.", p, "warning")
        : [];
    renderedPatch = patchRows(patch || proposal!, p, unconfirmed);
    rows.push(
      ...(renderedPatch ?? [
        ...unconfirmed,
        ...message("Patch display unavailable: invalid or oversized patch.", p, "warning")
      ])
    );
    rows.push(...applicationFailure(p));
  }

  if (!renderedPatch && p.call?.change?.availability === "unavailable")
    rows.push(...message(p.call.change.reason ?? "Change information unavailable.", p, "warning"));

  return { rows, hasPatch: !!(patch || proposal) };
}

function mcpItems(facts: McpFacts, p: Projection): TreeItem[] {
  const items: TreeItem[] = [];
  const failed =
    p.context.isError || facts.outcome === "transport-error" || facts.outcome === "returned-error";

  for (const block of facts.content) {
    const text =
      block.type === "text"
        ? p.theme.fg(failed ? "error" : "toolOutput", displayText(block.text))
        : block.type === "resource"
          ? `${reference("Resource: ", block.uri, p)}${block.text ? `\n${p.theme.fg("toolOutput", displayText(block.text))}` : ""}`
          : `${reference("[Media: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`;
    items.push({ rows: output(text, p, block.type === "text" ? 10 : Number.MAX_SAFE_INTEGER) });
  }

  return items;
}

function imageItems(content: AgentToolResult<unknown>["content"], p: Projection): TreeItem[] {
  if (p.context.showImages && getCapabilities().images) return [];

  return content.flatMap((block) =>
    block.type === "image"
      ? [
          {
            rows: output(
              `${reference("[Image: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`,
              p,
              5,
              true
            )
          }
        ]
      : []
  );
}

function styleResultParts(parts: readonly ResultTextPart[], p: Projection): string {
  return parts
    .map((part) => {
      if (!part.text) return "";
      if (part.kind !== "output")
        return p.theme.fg(
          part.kind === "annotation" ? "dim" : part.kind === "value" ? "text" : part.kind,
          displayText(part.text)
        );
      let content = p.adapter.family === "shell" ? styledOutput(part.text) : displayText(part.text);
      if (p.adapter.family === "read" && p.expanded && !p.context.isError)
        content = highlight(content, stringField(record(p.context.args).path));

      return content ? p.theme.fg("toolOutput", content) : "";
    })
    .join("");
}

function emptyOutputText(p: Projection): string {
  const unavailable = p.call?.lifecycle === "unavailable";

  return p.theme.fg(
    unavailable ? "muted" : "dim",
    unavailable
      ? "Output unavailable."
      : p.context.isPartial
        ? "Waiting for output…"
        : "(no output)"
  );
}

function previewParts(preview: OutputText): ResultTextPart[] {
  let start = 0;
  const parts: ResultTextPart[] = [];

  for (const range of preview.omissions ?? []) {
    parts.push(
      { kind: "output", text: preview.text.slice(start, range.start) },
      { kind: "warning", text: preview.text.slice(range.start, range.end) }
    );
    start = range.end;
  }

  parts.push({ kind: "output", text: preview.text.slice(start) });

  return parts;
}

function outputPreview(p: Projection): OutputText | undefined {
  const saved = p.expanded ? p.call?.savedOutput : undefined;
  if (saved?.text !== undefined) return { ...saved, text: saved.text };

  return p.call?.lifecycle !== "complete" ? p.call?.liveOutput : undefined;
}

function describedImage(
  content: AgentToolResult<unknown>["content"],
  index: number,
  p: Projection
): boolean {
  if (p.context.isPartial || p.context.isError) return false;
  const previous = content[index - 1],
    image = content[index];

  return (
    previous?.type === "text" &&
    image?.type === "image" &&
    p.adapter.imageCaptionMimeType?.(previous.text) === image.mimeType
  );
}

function contentItems(result: AgentToolResult<unknown>, p: Projection): TreeItem[] {
  const preview = outputPreview(p);
  const items: TreeItem[] =
    preview === undefined
      ? []
      : [
          {
            rows: output(styleResultParts(previewParts(preview), p) || emptyOutputText(p), p)
          }
        ];
  // Saved files contain process output, not Pi's failure footer or result middleware diagnostics.
  if (preview !== undefined && !p.context.isError)
    return [...items, ...imageItems(result.content, p)];
  const textContext = {
    ...p.context,
    hasImages: result.content.some((block) => block.type === "image")
  };

  for (const [index, block] of result.content.entries()) {
    if (block.type === "image") {
      if (!describedImage(result.content, index, p)) items.push(...imageItems([block], p));
      continue;
    }

    const parts = p.adapter.textParts?.(block.text, p.context.args, textContext) ?? [
      { kind: p.context.isError ? "error" : "output", text: block.text } satisfies ResultTextPart
    ];
    if (!parts.length) continue;
    const text = styleResultParts(parts, p);
    const rows = output(text || emptyOutputText(p), p, p.adapter.family === "invocation" ? 10 : 5);
    if (index === 0 || result.content[index - 1]?.type === "text") appendDetails(items, rows);
    else items.push({ rows });
  }

  if (!result.content.length && preview === undefined)
    items.push({ rows: output(emptyOutputText(p), p) });

  return items;
}

function appendDetails(items: TreeItem[], rows: string[]): void {
  if (!rows.length) return;
  if (!items.length) items.push({ rows: [] });
  items.at(-1)!.rows.push(...rows);
}

function unavailableHistory(p: Projection): DisplayNotice[] {
  if (p.call?.origin !== "historical") return [];
  const notices: DisplayNotice[] = [];
  if (p.adapter.id === "pi:write" && !p.call.change)
    notices.push({ kind: "unavailable", text: "Before-state unavailable; no historical diff." });
  if (
    p.expanded &&
    !p.call.operation &&
    ["pi:bash", "pi:powershell", "pi:edit", "pi:write"].includes(p.adapter.id)
  )
    notices.push({
      kind: "unavailable",
      text: "Operation details unavailable; call was not observed."
    });

  return notices;
}

function notices(result: AgentToolResult<unknown>, p: Projection): string[] {
  const notices = [...(p.adapter.notices?.(result, p.expanded) ?? [])];
  const path = p.call?.savedPath;
  if (path && !notices.some((notice) => notice.kind === "reference" && notice.value === path))
    notices.push({ kind: "reference", label: "Saved output", value: path });
  if (p.call?.savedOutput?.notice)
    notices.push({ kind: "warning", text: p.call.savedOutput.notice });
  notices.push(...unavailableHistory(p));
  const rows = notices.flatMap((notice) => {
    const text =
      notice.kind === "reference"
        ? reference(`${displayText(notice.label)}: `, notice.value, p)
        : p.theme.fg(
            notice.kind === "info" ? "dim" : notice.kind === "unavailable" ? "muted" : notice.kind,
            displayText(notice.text)
          );

    return wrapRows(text, bodyWidth(p.width));
  });

  if (p.expanded && p.call?.operation) {
    const operation = p.call.operation;
    const color =
      operation.outcome === "failure"
        ? "error"
        : operation.outcome === "cancelled"
          ? "warning"
          : operation.outcome === "unavailable"
            ? "muted"
            : "dim";
    const detail =
      p.theme.fg("dim", "Operation: ") +
      p.theme.fg(color, operation.outcome) +
      p.theme.fg("dim", `; ${Math.round(operation.durationMs)}ms`) +
      (operation.exitCode !== undefined
        ? p.theme.fg("dim", "; exit ") + p.theme.fg(color, String(operation.exitCode ?? "unknown"))
        : "") +
      (operation.timedOut ? p.theme.fg("error", "; timed out") : "");
    rows.push(...output(detail, p, 5, true));
  }

  return rows;
}

function annotateResult(items: TreeItem[], annotations: string[]): ResultBody {
  // Call-level notices must not become children of an unrelated final media/resource.
  // With one result item they can continue its body; otherwise they continue the root.
  if (items.length === 1) {
    appendDetails(items, annotations);

    return { items, annotations: [] };
  }

  return { items, annotations };
}

export function buildResultBody(current: AgentToolResult<unknown>, p: Projection): ResultBody {
  const annotations = notices(current, p);
  if (p.adapter.family === "read" && !p.expanded && !p.context.isError && !p.context.isPartial)
    return annotateResult(imageItems(current.content, p), annotations);
  const change = changeRows(current, p);
  const items: TreeItem[] = change.hasPatch ? [{ rows: change.rows }] : [];
  const facts = p.mcp;
  if (facts)
    return {
      items: [...items, ...mcpItems(facts, p)],
      annotations: [
        ...(facts.outcome === "transport-error" ? message("Transport error", p, "error") : []),
        ...(facts.outcome === "returned-error"
          ? message("Tool returned an error", p, "error")
          : []),
        ...(!change.hasPatch ? change.rows : []),
        ...annotations
      ]
    };
  if (!change.hasPatch || p.context.isError) {
    const content = contentItems(current, p);
    if (change.hasPatch || ["edit", "write", "shell"].includes(p.adapter.family))
      appendDetails(
        items,
        content.flatMap((item) => item.rows)
      );
    else items.push(...content);
  } else items.push(...imageItems(current.content, p));
  if (!change.hasPatch) appendDetails(items, change.rows);

  return annotateResult(items, annotations);
}
