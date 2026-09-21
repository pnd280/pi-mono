import { getCapabilities, stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";
import {
  highlightCodeBounded,
  highlightCodeSelection
} from "@pi-mono/libs/tui/components/code-highlight";
import { renderDiffBody } from "@pi-mono/libs/tui/components/diff-view";
import { displayText, sliceTerminalText, styledOutput } from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";
import { splitOutputText, type OutputText } from "@pi-mono/utils/output-text";

import type { BorrowedToolResult, DisplayNotice, McpFacts, ResultTextPart } from "../contracts.ts";
import { parseRetainedPatch } from "../diff.ts";
import { stringField } from "../terminal-text.ts";
import { record } from "../values.ts";
import {
  COMPACT_OUTPUT_CHARACTERS,
  expansionHint,
  codeHighlightLimits,
  output,
  message,
  reference
} from "./format.ts";
import { bodyWidth } from "./layout.ts";
import type { Projection, ResultBody } from "./types.ts";

// Mutable only while preparing a body; cards expose read-only measured items.
type TreeItem = { rows: string[] };

export function buildGroupRows(p: Projection): string[] {
  if (!p.call || !p.result) return [];
  const body = buildResultBody(p.result, p);

  return [...body.annotations, ...body.items.flatMap((item) => item.rows)];
}

function replacesOutput(p: Projection): boolean {
  return !p.expanded && !p.context.isError && !!p.summary && !p.summary.preserveOutput;
}

function patchRows(
  patch: string,
  p: Projection,
  annotations: readonly string[]
): string[] | undefined {
  const parsed = parseRetainedPatch(patch);
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
    compactRows: 30,
    contextRows: 2,
    expansionHint: expansionHint(),
    theme: p.theme,
    highlight: (source) =>
      highlightCodeBounded(source, {
        ...codeHighlightLimits,
        path: stringField(record(p.context.args).path)
      })
  });
  rows.push(...annotations, ...body);

  return rows;
}

function applicationFailure(p: Projection): string[] {
  const outcome = p.call?.operation?.outcome;
  if (!p.context.isError && outcome !== "failure") return [];

  let text =
    outcome === "success"
      ? "Tool result reports failure after application."
      : "Failed to apply change";
  if (p.outcome === "cancelled")
    text =
      outcome === "success"
        ? "Tool call cancelled after application."
        : "Change application cancelled.";

  return message(text, p, p.outcome === "cancelled" ? "warning" : "error");
}

type PatchCandidate = { patch: string; observed: boolean };

function patchCandidates(result: BorrowedToolResult, p: Projection): PatchCandidate[] {
  const suppliedPatch = record(result.details).patch;
  const published =
    p.adapter.patch && !p.context.isError && typeof suppliedPatch === "string" ? suppliedPatch : "";
  const observed = p.call?.change?.patch ?? "";

  return [
    ...(published ? [{ patch: published, observed: false }] : []),
    ...(observed && observed !== published ? [{ patch: observed, observed: true }] : [])
  ];
}

function renderPatchCandidates(
  candidates: PatchCandidate[],
  p: Projection
): { rows: string[]; rendered: boolean } {
  let fallbackAnnotations: string[] = [];

  for (const candidate of candidates) {
    const annotations =
      candidate.observed && p.call?.operation?.outcome !== "success"
        ? message("Proposed change; application not confirmed.", p, "warning")
        : [];
    const rows = patchRows(candidate.patch, p, annotations);
    fallbackAnnotations = annotations;

    if (rows) return { rows, rendered: true };
  }

  return {
    rows: [
      ...fallbackAnnotations,
      ...message("Patch display unavailable: invalid or oversized patch.", p, "warning")
    ],
    rendered: false
  };
}

function changeRows(
  result: BorrowedToolResult,
  p: Projection
): { rows: string[]; hasPatch: boolean } {
  const candidates = patchCandidates(result, p);
  const rendered = candidates.length
    ? renderPatchCandidates(candidates, p)
    : { rows: [], rendered: false };
  const rows = [...rendered.rows];

  if (candidates.length) rows.push(...applicationFailure(p));
  if (!rendered.rendered && p.call?.change?.availability === "unavailable")
    rows.push(...message(p.call.change.reason ?? "Change information unavailable.", p, "warning"));

  return { rows, hasPatch: candidates.length > 0 };
}

function mcpItems(facts: McpFacts, p: Projection): TreeItem[] {
  const items: TreeItem[] = [];
  const color = (
    {
      cancelled: "warning",
      failure: "error",
      success: "toolOutput",
      unavailable: "toolOutput"
    } as const
  )[p.outcome];

  for (const block of facts.content) {
    if (block.type === "media") {
      const text = `${reference("[Media: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`;
      items.push({ rows: output(text, p, Number.MAX_SAFE_INTEGER) });
      continue;
    }

    if (block.type === "text" && replacesOutput(p)) continue;
    const parts: ResultTextPart[] =
      block.type === "text"
        ? [{ kind: "output", text: block.text }]
        : [
            { kind: "annotation", text: "Resource: " },
            { kind: "value", text: block.uri },
            ...(block.text && !replacesOutput(p)
              ? [{ kind: "output" as const, text: `\n${block.text}` }]
              : [])
          ];
    items.push({ rows: resultPartRows(parts, p, 10, { outputColor: color }) });
  }

  return items;
}

function imageItems(content: BorrowedToolResult["content"], p: Projection): TreeItem[] {
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

type StyledSourcePart = ResultTextPart & { leadingSgr?: string };

type ThemeColor = Parameters<Projection["theme"]["fg"]>[0];

function resultPartSlice(
  parts: readonly ResultTextPart[],
  start: number,
  end: number,
  shellOutput: boolean
): StyledSourcePart[] {
  const selected: StyledSourcePart[] = [];
  let position = 0;

  for (const part of parts) {
    const partEnd = position + part.text.length;

    if (partEnd <= start) {
      position = partEnd;
      continue;
    }

    if (position >= end) break;

    const localStart = Math.max(0, start - position);
    const localEnd = Math.min(part.text.length, end - position);
    const slice = sliceTerminalText(part.text, localStart, localEnd, {
      preserveSgr: shellOutput && part.kind === "output" && localStart > 0
    });

    if (slice.text)
      selected.push({
        ...part,
        text: slice.text,
        ...(slice.leadingSgr ? { leadingSgr: slice.leadingSgr } : {})
      });

    position = partEnd;
  }

  return selected;
}

function styleResultParts(
  parts: readonly StyledSourcePart[],
  p: Projection,
  outputColor: ThemeColor = "toolOutput"
): string {
  return parts
    .map((part) => {
      if (!part.text) return "";
      if (part.kind !== "output")
        return p.theme.fg(
          (
            {
              annotation: "dim",
              value: "text",
              warning: "warning",
              error: p.outcome === "cancelled" ? "warning" : "error"
            } as const
          )[part.kind],
          displayText(part.text)
        );
      let content =
        p.adapter.family === "shell"
          ? styledOutput(`${part.leadingSgr ?? ""}${part.text}`)
          : displayText(part.text);

      if (p.adapter.family === "read" && p.expanded && !p.context.isError) {
        const options = {
          ...codeHighlightLimits,
          path: stringField(record(p.context.args).path)
        };
        content = part.selection
          ? highlightCodeSelection(part.text, {
              ...options,
              ranges: part.selection,
              mark: (text) => p.theme.bg("searchMatchBg", text)
            }).text
          : highlightCodeBounded(content, options);
      }

      return content ? p.theme.fg(outputColor, content) : "";
    })
    .join("");
}

function trimShellTrailingRows(text: string, p: Projection): string {
  if (p.adapter.family !== "shell") return text;
  let end = text.length;
  const trailingStyles: string[] = [];

  // Work backward through normalized rows before preview budgeting. Keep internal
  // whitespace and move SGR resets off discarded blank rows onto the final row.
  while (end > 0) {
    const newline = text.lastIndexOf("\n", end - 1);
    const row = text.slice(newline + 1, end);
    if (stripTerminalSequences(row).trim()) break;
    if (newline < 0) return "";
    trailingStyles.push(row.replace(/\s/g, ""));
    end = newline;
  }

  return end === 0 ? "" : text.slice(0, end) + trailingStyles.reverse().join("");
}

function resultPartRows(
  parts: readonly ResultTextPart[],
  p: Projection,
  maximum: number,
  options: { empty?: string; outputColor?: ThemeColor } = {}
): string[] {
  const characters = parts.reduce((total, part) => total + part.text.length, 0);

  if (p.expanded || characters <= COMPACT_OUTPUT_CHARACTERS) {
    const styled = styleResultParts(parts, p, options.outputColor) || options.empty || "";
    const text = trimShellTrailingRows(styled, p);

    return output(text || (p.adapter.family === "shell" ? emptyOutputText(p) : ""), p, maximum);
  }

  const headCharacters = Math.ceil(COMPACT_OUTPUT_CHARACTERS / 2);
  const tailCharacters = Math.floor(COMPACT_OUTPUT_CHARACTERS / 2);
  const head = resultPartSlice(parts, 0, headCharacters, p.adapter.family === "shell");
  const tail = resultPartSlice(
    parts,
    characters - tailCharacters,
    characters,
    p.adapter.family === "shell"
  );
  const width = bodyWidth(p.width);
  const headRows = Math.ceil((maximum - 1) / 2);
  const tailRows = Math.floor((maximum - 1) / 2);
  const omission = truncateToWidth(
    p.theme.fg("dim", `… more output (${expansionHint()})`),
    width,
    "…"
  );

  return [
    ...wrapRows(styleResultParts(head, p, options.outputColor), width).slice(0, headRows),
    omission,
    ...wrapRows(
      trimShellTrailingRows(styleResultParts(tail, p, options.outputColor), p),
      width
    ).slice(-tailRows)
  ];
}

function emptyOutputText(p: Projection): string {
  if (p.call?.lifecycle === "unavailable") return p.theme.fg("muted", "Output unavailable.");

  return p.theme.fg("dim", p.context.isPartial ? "Waiting for output…" : "(no output)");
}

function previewParts(preview: OutputText): ResultTextPart[] {
  return splitOutputText(preview).map(({ kind, text }) => ({
    kind: kind === "omission" ? "warning" : "output",
    text
  }));
}

function outputPreview(p: Projection): OutputText | undefined {
  const saved = p.expanded ? p.call?.savedOutput : undefined;
  if (saved?.text !== undefined) return { ...saved, text: saved.text };

  return p.call?.lifecycle !== "complete" ? p.call?.liveOutput : undefined;
}

function describedImage(
  content: BorrowedToolResult["content"],
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

function contentItems(result: BorrowedToolResult, p: Projection): TreeItem[] {
  if (replacesOutput(p)) return imageItems(result.content, p);
  const preview = outputPreview(p);
  const items: TreeItem[] =
    preview === undefined
      ? []
      : [
          {
            rows: resultPartRows(previewParts(preview), p, 5, { empty: emptyOutputText(p) })
          }
        ];
  // Saved files contain process output, not Pi's failure footer or result middleware diagnostics.
  if (preview !== undefined && !p.context.isError)
    return [...items, ...imageItems(result.content, p)];
  const textContext = {
    ...p.context,
    isCancelled: p.outcome === "cancelled",
    expanded: p.expanded,
    hasImages: result.content.some((block) => block.type === "image"),
    result
  };

  for (const [index, block] of result.content.entries()) {
    if (block.type === "image") {
      if (!describedImage(result.content, index, p)) items.push(...imageItems([block], p));
      continue;
    }

    const parts = p.adapter.textParts?.(block.text, p.context.args, {
      ...textContext,
      contentIndex: index
    }) ?? [
      { kind: p.context.isError ? "error" : "output", text: block.text } satisfies ResultTextPart
    ];
    if (!parts.length) continue;
    const rows = resultPartRows(parts, p, p.adapter.family === "invocation" ? 10 : 5, {
      empty: emptyOutputText(p)
    });
    if (index === 0 || result.content[index - 1]?.type === "text") appendDetails(items, rows);
    else items.push({ rows });
  }

  if (!result.content.length && preview === undefined)
    items.push({ rows: output(emptyOutputText(p), p) });

  return items;
}

function appendDetails(items: TreeItem[], rows: string[]): void {
  if (!rows.length) return;
  const last = items.at(-1);
  if (last) last.rows.push(...rows);
  else items.push({ rows: [...rows] });
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

function notices(result: BorrowedToolResult, p: Projection): string[] {
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
            ({ info: "dim", unavailable: "muted", warning: "warning", error: "error" } as const)[
              notice.kind
            ],
            displayText(notice.text)
          );

    return wrapRows(text, bodyWidth(p.width));
  });

  if (p.expanded && p.call?.operation && !(p.adapter.family === "shell" && p.summary)) {
    const operation = p.call.operation;
    const color = (
      { failure: "error", cancelled: "warning", unavailable: "muted", success: "dim" } as const
    )[operation.outcome];
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

export function buildResultBody(current: BorrowedToolResult, p: Projection): ResultBody {
  const body = resultBody(current, p);
  if (!p.summary?.text) return body;
  const color = p.outcome === "cancelled" ? "warning" : "error";

  return {
    ...body,
    annotations: [
      ...message(p.summary.text, p, p.context.isError ? color : "dim"),
      ...body.annotations
    ]
  };
}

function resultBody(current: BorrowedToolResult, p: Projection): ResultBody {
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
        ...(p.outcome === "failure" && facts.outcome === "transport-error"
          ? message("Transport error", p, "error")
          : []),
        ...(p.outcome === "failure" && facts.outcome === "returned-error"
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
