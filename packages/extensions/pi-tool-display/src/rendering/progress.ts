import { formatDuration } from "@pi-mono/libs/tui/duration";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { textPrefix, wrapRows } from "@pi-mono/libs/tui/text-budget";

import type { DisplayProgress, DisplayProgressStatus } from "../contracts.ts";
import type { Projection } from "./types.ts";

type StatusColor = "dim" | "muted" | "warning" | "success" | "error" | "accent";

const toneColors = {
  active: "warning",
  success: "success",
  failure: "error",
  cancelled: "warning",
  returned: "accent"
} as const satisfies Record<DisplayProgressStatus["tone"], StatusColor>;

/** Progress heading rows. Running elapsed time makes them stale each second. */
export type ProgressHeading = {
  readonly rows: string[];
  readonly stale: () => boolean;
};

type Elapsed = { text: string; staleAt: number };

function elapsed(progress: DisplayProgress, now: number, final: boolean): Elapsed {
  const { startedAt, endedAt } = progress;
  if (startedAt === undefined) return { text: "", staleAt: Infinity };
  if (endedAt !== undefined)
    return { text: formatDuration(Math.max(0, endedAt - startedAt)), staleAt: Infinity };
  // A final result without an end time has no duration to show.
  if (final) return { text: "", staleAt: Infinity };
  // A running timer ticks in whole seconds.
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return {
    text: seconds ? formatDuration(seconds * 1000) : "0s",
    staleAt: startedAt + (seconds + 1) * 1000
  };
}

/** Without a reported status, the host's call phase selects the label. */
function status(
  progress: DisplayProgress,
  p: Projection,
  clean: (text: string) => string,
  time: string
): { text: string; color: StatusColor } {
  if (!p.context.isPartial && p.outcome === "unavailable")
    return { text: "outcome unavailable", color: "muted" };
  if (!p.context.isPartial && (p.outcome === "failure" || p.outcome === "cancelled"))
    return {
      text: [
        p.outcome === "failure" ? TUI_GLYPHS.outcome.failure : TUI_GLYPHS.outcome.cancelled,
        p.outcome === "failure" ? "failed" : "cancelled",
        time
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
    .concat(time)
    .filter(Boolean)
    .join(" ");

  return { text, color: toneColors[reported.tone] };
}

type CardColor = "error" | "warning" | "accent" | "muted";

/** Pending uses `warning`; failure and cancellation use `error`, except cancelled details. */
function cardColors(p: Projection): { marker: CardColor; label: CardColor; secondary: CardColor } {
  if (p.context.isPartial) return { marker: "warning", label: "warning", secondary: "muted" };
  if (p.outcome === "failure") return { marker: "error", label: "error", secondary: "error" };
  if (p.outcome === "cancelled") return { marker: "error", label: "error", secondary: "warning" };

  return { marker: "muted", label: "accent", secondary: "muted" };
}

export function progressHeading(progress: DisplayProgress, p: Projection): ProgressHeading {
  const time = elapsed(progress, Date.now(), !p.context.isPartial);
  const stale = () => Date.now() >= time.staleAt;
  const theme = p.theme;

  const clean = (text: string) => {
    const retained = textPrefix(text, 2048);

    return compactDisplayText(retained) + (retained.length < text.length ? "…" : "");
  };

  const colors = cardColors(p);
  const marker = p.expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
  const state = status(progress, p, clean, time.text);
  const separator = theme.fg("dim", " · ");
  // Style the status before wrapping so continuation rows keep its colour.
  const title = `${theme.fg(colors.label, theme.bold(clean(progress.label)))} ${clean(progress.description)}${separator}${theme.fg(state.color, state.text)}`;
  const bodyWidth = Math.max(1, p.width - 2);
  const rows = wrapRows(title, bodyWidth).map(
    (row, index) => `${index ? "  " : `${theme.fg(colors.marker, marker)} `}${row}`
  );
  const identity = clean(progress.identity);
  const secondaryText = clean(progress.secondary);
  const secondary = [
    ...(identity ? [theme.fg("dim", identity)] : []),
    ...(secondaryText ? [theme.fg(colors.secondary, secondaryText)] : [])
  ].join(separator);
  // Metadata and details lead into the result branch with a guide; without a body, they use a plain indent.
  // A collapsed card shows a body only for a result preview.
  const hasBody = p.result !== undefined && (p.expanded || progress.resultPreview === true);
  const indent = hasBody ? `  ${theme.fg("dim", TUI_GLYPHS.tree.guide)} ` : "    ";
  const detailWidth = Math.max(1, p.width - 4);
  rows.push(...wrapRows(secondary, detailWidth).map((row) => `${indent}${row}`));

  if (!p.expanded) return { rows, stale };

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

  return { rows, stale };
}
