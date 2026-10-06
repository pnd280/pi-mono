import { truncateToWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { textPrefix, wrapRows } from "@pi-mono/libs/tui/text-budget";

import type { DisplayProgress, DisplayProgressStatus } from "../contracts.ts";
import { tree } from "./format.ts";
import type { Projection } from "./types.ts";

const PREVIEW_LINES = 3;

type StatusColor = "dim" | "muted" | "warning" | "success" | "error" | "accent";

const toneColors = {
  active: "warning",
  success: "success",
  failure: "error",
  returned: "accent"
} as const satisfies Record<DisplayProgressStatus["tone"], StatusColor>;

function elapsed(progress: DisplayProgress): string {
  if (progress.startedAt === undefined) return "";
  const seconds = Math.max(
    0,
    Math.floor(((progress.endedAt ?? Date.now()) - progress.startedAt) / 1000)
  );

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Without a reported status, the host's call phase selects the label. */
function status(
  progress: DisplayProgress,
  p: Projection,
  clean: (text: string) => string
): { text: string; color: StatusColor } {
  if (!p.context.isPartial && p.outcome === "unavailable")
    return { text: "outcome unavailable", color: "muted" };
  if (!p.context.isPartial && (p.outcome === "failure" || p.outcome === "cancelled"))
    return {
      text: [
        p.outcome === "failure" ? TUI_GLYPHS.outcome.failure : TUI_GLYPHS.outcome.cancelled,
        p.outcome === "failure" ? "failed" : "cancelled",
        elapsed(progress)
      ]
        .filter(Boolean)
        .join(" "),
      color: p.outcome === "cancelled" ? "warning" : "error"
    };
  const reported = progress.status;

  if (!reported) {
    if (!p.context.argsComplete) return { text: "preparing", color: "dim" };

    return {
      text: `${TUI_GLYPHS.queued} ${p.context.executionStarted ? "starting" : "waiting to run"}`,
      color: "dim"
    };
  }

  const text = [reported.glyph, reported.text]
    .map((part) => (part ? clean(part) : ""))
    .concat(elapsed(progress))
    .filter(Boolean)
    .join(" ");

  return { text, color: toneColors[reported.tone] };
}

export function progressRows(progress: DisplayProgress, p: Projection): string[] {
  const theme = p.theme;

  const clean = (text: string) => {
    const retained = textPrefix(text, 2048);

    return compactDisplayText(retained) + (retained.length < text.length ? "…" : "");
  };

  const failed = !p.context.isPartial && ["failure", "cancelled"].includes(p.outcome);
  const marker = p.expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
  let markerColor: "error" | "warning" | "muted" = "muted";
  if (p.context.isPartial) markerColor = "warning";
  if (failed) markerColor = "error";
  const state = status(progress, p, clean);
  const separator = theme.fg("dim", " · ");
  // Style the status before wrapping so continuation rows keep its colour.
  const title = `${theme.fg(failed ? "error" : "accent", theme.bold(clean(progress.label)))} ${clean(progress.description)}${separator}${theme.fg(state.color, state.text)}`;
  const bodyWidth = Math.max(1, p.width - 2);
  const rows = wrapRows(title, bodyWidth).map(
    (row, index) => `${index ? "  " : `${theme.fg(markerColor, marker)} `}${row}`
  );
  const identity = clean(progress.identity);
  const secondaryText = clean(progress.secondary);
  const secondary = [
    ...(identity ? [theme.fg("dim", identity)] : []),
    ...(secondaryText ? [theme.fg(failed ? "error" : "muted", secondaryText)] : [])
  ].join(separator);
  rows.push(...wrapRows(secondary, bodyWidth).map((row) => `  ${row}`));

  if (!p.expanded) return rows;

  // Details lead into the result branch with a guide; before a result, they use a plain indent.
  const indent = p.result ? `  ${theme.fg("dim", TUI_GLYPHS.tree.guide)} ` : "    ";
  const detailWidth = Math.max(1, p.width - 4);

  for (const field of progress.fields)
    rows.push(
      ...wrapRows(
        `${theme.fg("dim", `${clean(field.label)}:`)} ${clean(field.value)}`,
        detailWidth
      ).map((row) => `${indent}${row}`)
    );

  if (progress.prompt !== undefined) {
    const retained = textPrefix(progress.prompt, 16 * 1024);
    const prompt = displayText(retained).split("\n");
    rows.push(`${indent}${theme.fg("dim", "Prompt:")}`);
    for (const line of prompt.slice(0, 10))
      rows.push(
        ...(line ? wrapRows(line, Math.max(1, p.width - 6)) : [""]).map(
          (row) => `${indent}  ${row}`
        )
      );
    if (retained.length < progress.prompt.length || prompt.length > 10)
      rows.push(`${indent}  ${theme.fg("dim", "… (prompt truncated)")}`);
  }

  if (p.result) rows.push(`${indent}${theme.fg("dim", "Result:")}`);

  return rows;
}

/** Collapsed completed cards show the first logical lines of the retained result in a result branch. */
export function progressPreviewRows(p: Projection): string[] {
  const theme = p.theme;
  const width = Math.max(1, p.width - 4);
  const result = p.result;
  const content = result?.content ?? [];
  // Use the adapter's interpretation of known envelopes, as the expanded body does.
  const text = displayText(
    content
      .flatMap((block, contentIndex) => {
        if (block.type !== "text" || !result) return [];
        const parts = p.adapter.textParts?.(block.text, p.context.args, {
          result,
          contentIndex,
          isError: p.context.isError,
          isPartial: p.context.isPartial,
          isCancelled: p.outcome === "cancelled",
          expanded: false,
          hasImages: content.some((item) => item.type === "image")
        }) ?? [{ kind: "output", text: block.text }];

        return parts.length ? [parts.map((part) => part.text).join("")] : [];
      })
      .join("\n")
  )
    .replace(/^(?:[^\S\n]*\n)+/, "")
    .trimEnd();
  if (!text) return tree([{ rows: [theme.fg("dim", "(no output)")] }], p);
  const lines = text.split("\n");
  const hidden = lines.length - PREVIEW_LINES;

  return tree(
    [
      {
        rows: [
          ...lines
            .slice(0, PREVIEW_LINES)
            .map((line) => theme.fg("toolOutput", truncateToWidth(line, width, "…"))),
          ...(hidden > 0
            ? [theme.fg("dim", `… ${hidden} more ${hidden === 1 ? "line" : "lines"}`)]
            : [])
        ]
      }
    ],
    p
  );
}
