import { getCapabilities, stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";
import {
  highlightCodeBounded,
  highlightCodeSelection
} from "@pi-mono/libs/tui/components/code-highlight";
import { renderDiffPanel } from "@pi-mono/libs/tui/components/diff-view";
import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";
import { formatDuration } from "@pi-mono/libs/tui/duration";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import {
  compactDisplayText,
  displayText,
  sliceTerminalText,
  styledOutput
} from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";
import { splitOutputText, type OutputText } from "@pi-mono/utils/output-text";
import type { ParsedPatch } from "@pi-mono/utils/patch";

import type {
  BorrowedToolResult,
  DisplayNotice,
  LocalDetails,
  McpFacts,
  NestedCall,
  ResultTextPart
} from "../contracts.ts";
import { changeReasonText, parseRetainedPatch } from "../diff.ts";
import { record, stringField } from "../values.ts";
import {
  bodyWidth,
  COMPACT_OUTPUT_CHARACTERS,
  expansionHint,
  codeHighlightLimits,
  output,
  message,
  reference,
  tree
} from "./format.ts";
import type { Projection } from "./types.ts";

// Mutable only while preparing a body; placements read measured items.
type TreeItem = { rows: string[]; image?: true };

type ResultBody = Readonly<{
  items: readonly TreeItem[];
  annotations: readonly string[];
  /** Full-width patch panel rows, between the annotations and the tree. */
  panel: readonly string[];
}>;

const PREVIEW_LINES = 3;

/**
 * The result placements of one prepared card: its body in the result slot, its
 * rows under a group member heading, and the collapsed progress preview. Each
 * placement is built on first use, so a hidden slot does no work.
 */
export class PreparedResult {
  private body: ResultBody | undefined;
  private group: readonly string[] | undefined;

  /** `card` is the prepared card that holds this result. */
  constructor(private card: Projection) {}

  private get cardBody(): ResultBody {
    const p = this.card;

    return (this.body ??= p.result
      ? buildResultBody(p.result, p)
      : { items: [], annotations: [], panel: [] });
  }

  /** Whether the card has tree items for the heading's continuation guide. */
  get hasBody(): boolean {
    return this.cardBody.items.some((item) => item.rows.length > 0);
  }

  /** The card body in the result slot. Collapsed group members show it in the group. */
  rows(): string[] {
    const p = this.card;
    if (p.group && !p.expanded) return [];
    const { items, annotations, panel } = this.cardBody;

    return [
      ...renderTreeContinuation(annotations, {
        width: p.width,
        indent: 2,
        style: (text) => p.theme.fg("dim", text),
        hasChildren: this.hasBody
      }),
      ...panel,
      ...tree(items, p)
    ];
  }

  /** The result rows under a group member heading, with the same policy as the card body. */
  get groupRows(): readonly string[] {
    if (this.group) return this.group;
    const p = this.card;
    if (!p.call || !p.result) return (this.group = []);
    const body = buildResultBody(p.result, atWidth(p, p.width - 2));

    return (this.group = [
      ...body.annotations,
      ...body.panel,
      ...body.items.flatMap((item) => item.rows)
    ]);
  }

  /** The first logical lines of a collapsed completed progress card's retained result. */
  progressPreview(): string[] {
    const p = this.card;
    const theme = p.theme;
    const width = Math.max(1, p.width - 4);
    const result = p.result;
    if (!result) return [];
    const parts = textParts(result, p, false);
    const retained: ResultTextPart[] = [];
    let remaining = COMPACT_OUTPUT_CHARACTERS;
    let truncated = false;

    // Interpret complete envelopes, but bound formatting before normalising text.
    for (const [contentIndex, block] of result.content.entries()) {
      if (block.type !== "text") continue;
      const blockParts = parts(contentIndex, block.text);
      if (!blockParts.length) continue;

      if (retained.length) {
        if (remaining === 0) {
          truncated = true;
          break;
        }

        retained.push({ kind: "output", text: "\n" });
        remaining--;
      }

      for (const part of blockParts) {
        const text = sliceTerminalText(part.text, 0, remaining).text;
        retained.push({ ...part, text });
        remaining -= text.length;

        if (text.length < part.text.length) {
          truncated = true;
          break;
        }
      }

      if (truncated) break;
    }

    // Measure logical lines with the shared wrapper so each line keeps its styling.
    const allLines = wrapRows(styleResultParts(retained, p), Number.MAX_SAFE_INTEGER);
    const hasText = (line: string) => stripTerminalSequences(line).trim().length > 0;
    const first = allLines.findIndex(hasText);
    const end = allLines.reduce((end, line, index) => (hasText(line) ? index + 1 : end), 0);
    const lines = allLines.slice(Math.max(0, first), end);
    if (!lines.length && !truncated) return tree([{ rows: [theme.fg("dim", "(no output)")] }], p);
    // A hint must save space, so it never replaces a single line.
    const shown = lines.length > PREVIEW_LINES + 1 ? PREVIEW_LINES : lines.length;
    const hidden = lines.length - shown;

    return tree(
      [
        {
          rows: [
            ...lines.slice(0, shown).map((line) => truncateToWidth(line, width, "…")),
            ...(truncated || hidden > 0
              ? [
                  theme.fg(
                    "dim",
                    truncateToWidth(
                      `… ${truncated ? "more output" : `${hidden} more lines`} (${expansionHint()})`,
                      width,
                      "…"
                    )
                  )
                ]
              : [])
          ]
        }
      ],
      p
    );
  }
}

/** Copies only projection fields, so card-only callbacks stay unread. */
function atWidth(p: Projection, width: number): Projection {
  const { name, adapter, context, theme, expanded, showParameters, call, result, group } = p;

  return {
    name,
    adapter,
    context,
    theme,
    width,
    expanded,
    showParameters,
    call,
    result,
    group,
    mcp: p.mcp,
    outcome: p.outcome,
    summary: p.summary
  };
}

/** The display adapter's parts for each text block; without the callback, a block is plain text. */
function textParts(
  result: BorrowedToolResult,
  p: Projection,
  expanded: boolean
): (contentIndex: number, text: string) => ResultTextPart[] {
  const context = {
    ...p.context,
    isCancelled: p.outcome === "cancelled",
    expanded,
    hasImages: result.content.some((block) => block.type === "image"),
    result
  };

  return (contentIndex, text) =>
    p.adapter.textParts?.(text, p.context.args, { ...context, contentIndex }) ?? [
      { kind: p.context.isError ? "error" : "output", text }
    ];
}

const COMPACT_NESTED_CALLS = 8;

const nestedCallStatus = {
  running: { icon: "…", color: "warning" },
  success: { icon: TUI_GLYPHS.outcome.success, color: "success" },
  failure: { icon: TUI_GLYPHS.outcome.failure, color: "error" },
  cancelled: { icon: TUI_GLYPHS.outcome.cancelled, color: "warning" }
} as const;

/** Cents for larger amounts, two significant digits for fractions of a cent. */
function formatCost(cost: number): string {
  return `$${cost >= 0.01 ? cost.toFixed(2) : cost.toPrecision(2)}`;
}

function nestedCallRows(call: NestedCall, p: Projection): string[] {
  const width = bodyWidth(p.width);
  const status = nestedCallStatus[call.status];
  const fields = [
    p.theme.fg(status.color, status.icon),
    p.theme.fg("text", compactDisplayText(call.name))
  ];
  if (call.args) fields.push(p.theme.fg("muted", compactDisplayText(call.args)));
  if (call.durationMs !== undefined)
    fields.push(p.theme.fg("dim", formatDuration(call.durationMs)));
  if (call.cost !== undefined && call.cost > 0)
    fields.push(p.theme.fg("dim", formatCost(call.cost)));
  const line = fields.join(" ");
  if (!p.expanded) return [truncateToWidth(line, width, "…")];
  const rows = wrapRows(line, width);
  if (call.error !== undefined && call.error !== "")
    for (const errorLine of displayText(call.error).split("\n"))
      rows.push(...wrapRows(p.theme.fg("error", errorLine), width - 2).map((row) => `  ${row}`));

  return rows;
}

/** Compact cards keep the latest calls; the cost total still covers every call. */
function nestedCallItems(result: BorrowedToolResult, p: Projection): TreeItem[] {
  const calls = p.adapter.nestedCalls?.(result);
  if (calls === undefined || calls.length === 0) return [];
  const shown = p.expanded ? calls : calls.slice(-COMPACT_NESTED_CALLS);
  const rows: string[] = [];
  if (shown.length < calls.length)
    rows.push(
      truncateToWidth(
        p.theme.fg("dim", `… ${calls.length - shown.length} earlier calls (${expansionHint()})`),
        bodyWidth(p.width),
        "…"
      )
    );

  for (const call of shown) rows.push(...nestedCallRows(call, p));
  const priced = calls.filter((call) => call.cost !== undefined && call.cost > 0);

  if (priced.length > 1) {
    const total = priced.reduce((sum, call) => sum + (call.cost ?? 0), 0);
    rows.push(...message(`Model calls: ${formatCost(total)}`, p, "muted"));
  }

  return [{ rows }];
}

function replacesOutput(p: Projection): boolean {
  return !p.expanded && !p.context.isError && !!p.summary && !p.summary.preserveOutput;
}

/** A displayable patch and the rows that lead its panel. */
type PatchChange = { parsed: ParsedPatch; annotations: readonly string[] };

/** The full-width panel for a patch; `footer` holds the card details that follow it. */
function patchPanel(change: PatchChange, p: Projection, footer: readonly string[]): string[] {
  const { parsed } = change;
  // Preserve +0 -0 for empty patches so a no-op still has visible output.
  const oneSided =
    (parsed.added > 0 && parsed.removed === 0) || (parsed.removed > 0 && parsed.added === 0);
  const totals =
    p.adapter.family === "write" && oneSided
      ? []
      : [
          `${p.theme.fg("toolDiffAdded", `+${parsed.added}`)} ${p.theme.fg("toolDiffRemoved", `-${parsed.removed}`)}`
        ];

  return renderDiffPanel(parsed, {
    width: p.width,
    expanded: p.expanded,
    compactRows: 30,
    contextRows: 2,
    expansionHint: expansionHint(),
    theme: p.theme,
    highlight: (source) =>
      highlightCodeBounded(source, {
        ...codeHighlightLimits,
        path: stringField(record(p.context.args).path)
      }),
    header: [...totals, ...change.annotations],
    footer
  });
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
  const change = p.call?.change;
  const observed = change && change.change !== "unavailable" ? change.patch : "";

  return [
    ...(published ? [{ patch: published, observed: false }] : []),
    ...(observed && observed !== published ? [{ patch: observed, observed: true }] : [])
  ];
}

function selectPatch(
  candidates: PatchCandidate[],
  p: Projection
): { rows: string[]; patch: PatchChange | undefined } {
  let fallbackAnnotations: string[] = [];

  for (const candidate of candidates) {
    const annotations =
      candidate.observed && p.call?.operation?.outcome !== "success"
        ? message("Proposed change; application not confirmed.", p, "warning")
        : [];
    const parsed = parseRetainedPatch(candidate.patch);
    fallbackAnnotations = annotations;

    if (parsed) return { rows: [], patch: { parsed, annotations } };
  }

  return {
    rows: [
      ...fallbackAnnotations,
      ...message("Patch display unavailable: invalid or oversized patch.", p, "warning")
    ],
    patch: undefined
  };
}

/** With a patch, `rows` are the details that follow it; otherwise they replace it. */
function changeRows(
  result: BorrowedToolResult,
  p: Projection
): { rows: string[]; patch: PatchChange | undefined } {
  const candidates = patchCandidates(result, p);
  const selected = candidates.length ? selectPatch(candidates, p) : { rows: [], patch: undefined };
  const rows = [...selected.rows];

  if (candidates.length) rows.push(...applicationFailure(p));
  const change = p.call?.change;
  if (!selected.patch && change?.change === "unavailable")
    rows.push(...message(changeReasonText(change.reason), p, "warning"));

  return { rows, patch: selected.patch };
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

  // Consecutive text blocks share one compact budget, as in generic results.
  let run: ResultTextPart[] = [];

  const flushRun = () => {
    if (run.length) items.push({ rows: resultPartRows(run, p, 10, { outputColor: color }) });
    run = [];
  };

  for (const block of facts.content) {
    if (block.type === "text") {
      if (replacesOutput(p)) continue;
      if (run.length) run.push({ kind: "output", text: "\n" });
      run.push({ kind: "output", text: block.text });
      continue;
    }

    flushRun();

    if (block.type === "media") {
      const text = `${reference("[Media: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`;
      items.push({ rows: output(text, p, Number.MAX_SAFE_INTEGER) });
      continue;
    }

    const parts: ResultTextPart[] = [
      { kind: "annotation", text: "Resource: " },
      { kind: "value", text: block.uri },
      ...(block.text && !replacesOutput(p)
        ? [{ kind: "output" as const, text: `\n${block.text}` }]
        : [])
    ];
    items.push({ rows: resultPartRows(parts, p, 10, { outputColor: color }) });
  }

  flushRun();

  return items;
}

function imageItems(content: BorrowedToolResult["content"], p: Projection): TreeItem[] {
  if (p.context.showImages && getCapabilities().images) return [];

  return content.flatMap((block) =>
    block.type === "image"
      ? [
          {
            image: true,
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
  const parts = textParts(result, p, p.expanded);

  // Consecutive text blocks share one compact budget, so output split across
  // blocks (such as one block per codemode `text()` call) previews as one stream.
  let run: ResultTextPart[] = [];
  let runAfterImage = false;

  const flushRun = () => {
    if (!run.length) return;
    const rows = resultPartRows(run, p, p.adapter.family === "invocation" ? 10 : 5, {
      empty: emptyOutputText(p)
    });
    if (runAfterImage) items.push({ rows });
    else appendDetails(items, rows);
    run = [];
  };

  for (const [index, block] of result.content.entries()) {
    if (block.type === "image") {
      flushRun();
      // Suppressed text blocks must not erase the image boundary.
      runAfterImage = true;
      if (!describedImage(result.content, index, p)) items.push(...imageItems([block], p));
      continue;
    }

    const blockParts = parts(index, block.text);
    if (!blockParts.length) continue;
    if (run.length) run.push({ kind: "output", text: "\n" });
    run.push(...blockParts);
  }

  flushRun();

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

const localNotices: Partial<Record<LocalDetails, string>> = {
  "not-observed": "Operation details unavailable; call was not observed.",
  absent: "Local details for this part of the session are not on this machine.",
  unsaved: "Local details were not saved for this call.",
  "too-large": "Local details for this part of the session are unavailable: file exceeds 8 MiB.",
  unreadable:
    "Local details for this part of the session are unavailable: file cannot be read safely."
};

function unavailableHistory(p: Projection): DisplayNotice[] {
  if (p.call?.origin !== "historical") return [];
  const notices: DisplayNotice[] = [];
  if (p.adapter.id === "pi:write" && !p.call.change)
    notices.push({ kind: "unavailable", text: "Before-state unavailable; no historical diff." });
  const local = p.call.local && localNotices[p.call.local];
  if (p.expanded && local) notices.push({ kind: "unavailable", text: local });

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
    let timing = "";
    if (operation.durationMs !== undefined)
      timing = p.theme.fg("dim", `; ${formatDuration(operation.durationMs)}`);
    else if (p.call.local === "absent")
      timing = p.theme.fg("muted", "; timing not on this machine");
    const detail =
      p.theme.fg("dim", "Operation: ") +
      p.theme.fg(color, operation.outcome) +
      timing +
      (operation.exitCode !== undefined
        ? p.theme.fg("dim", "; exit ") + p.theme.fg(color, String(operation.exitCode ?? "unknown"))
        : "") +
      (operation.timedOut ? p.theme.fg("error", "; timed out") : "");
    rows.push(...output(detail, p, 5, true));
  }

  return rows;
}

function annotateResult(items: TreeItem[], annotations: string[]): ResultBody {
  // Call-level notices follow the output, but must not become children of an unrelated
  // final media/resource. With one result item they continue its body; with several,
  // they form a final branch. Without items they continue the root.
  if (items.length === 1) appendDetails(items, annotations);
  else if (items.length > 1 && annotations.length) items.push({ rows: [...annotations] });
  else return { items, annotations, panel: [] };

  return { items, annotations: [], panel: [] };
}

function buildResultBody(current: BorrowedToolResult, p: Projection): ResultBody {
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
  const nested = nestedCallItems(current, p);
  if (p.adapter.family === "read" && !p.expanded && !p.context.isError && !p.context.isPartial)
    return annotateResult([...nested, ...imageItems(current.content, p)], annotations);
  const change = changeRows(current, p);
  const facts = p.mcp;

  if (facts) {
    const body = annotateResult([...nested, ...mcpItems(facts, p)], annotations);

    return {
      items: body.items,
      annotations: [
        ...(p.outcome === "failure" && facts.outcome === "transport-error"
          ? message("Transport error", p, "error")
          : []),
        ...(p.outcome === "failure" && facts.outcome === "returned-error"
          ? message("Tool returned an error", p, "error")
          : []),
        ...(!change.patch ? change.rows : []),
        ...body.annotations
      ],
      panel: change.patch ? patchPanel(change.patch, p, change.rows) : []
    };
  }

  if (change.patch) {
    // Failure text and call notices follow the patch; images stay in the tree.
    const details = p.context.isError
      ? contentItems(current, p).flatMap((item) => (item.image ? [] : item.rows))
      : [];

    return {
      items: [...nested, ...imageItems(current.content, p)],
      annotations: [],
      panel: patchPanel(change.patch, p, [...change.rows, ...details, ...annotations])
    };
  }

  const items: TreeItem[] = [...nested];
  const content = contentItems(current, p);
  if (["edit", "write", "shell"].includes(p.adapter.family))
    appendDetails(
      items,
      content.flatMap((item) => item.rows)
    );
  else items.push(...content);
  appendDetails(items, change.rows);

  return annotateResult(items, annotations);
}
