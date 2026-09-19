import type { CustomEntry, EntryRenderOptions, Theme } from "@earendil-works/pi-coding-agent";
import { Text, type Component } from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { formatDuration, summarySchema, type RunSummary } from "./summary.ts";

type SummaryTheme = Pick<Theme, "fg">;

function lineCounts(added: number, removed: number, theme: SummaryTheme): string {
  const parts: string[] = [];
  if (added) parts.push(theme.fg("toolDiffAdded", `+${added}`));
  if (removed) parts.push(theme.fg("toolDiffRemoved", `−${removed}`));

  return parts.join(" ");
}

function summaryText(summary: RunSummary, expanded: boolean, theme: SummaryTheme): string {
  const separator = theme.fg("dim", " · ");
  const available = summary.files.filter((file) => file.status === "available");
  const parts = [theme.fg("dim", `Worked for ${formatDuration(summary.durationMs)}`)];
  if (summary.bashCalls)
    parts.push(
      theme.fg("dim", `${summary.bashCalls} bash ${summary.bashCalls === 1 ? "call" : "calls"}`)
    );
  if (available.length)
    parts.push(theme.fg("dim", `${available.length} ${available.length === 1 ? "file" : "files"}`));
  const counts = lineCounts(
    available.reduce((total, file) => total + file.added, 0),
    available.reduce((total, file) => total + file.removed, 0),
    theme
  );
  if (counts) parts.push(counts);
  if (available.length !== summary.files.length)
    parts.push(
      theme.fg("dim", available.length ? "File changes partial" : "File changes unavailable")
    );
  const lines = [parts.join(separator)];

  if (expanded) {
    for (const file of summary.files) {
      const path = theme.fg("dim", displayText(file.path).replace(/\s+/g, " "));
      const detail =
        file.status === "available"
          ? lineCounts(file.added, file.removed, theme)
          : theme.fg("dim", displayText(file.reason).replace(/\s+/g, " "));
      lines.push(`  ${path}${detail ? separator + detail : ""}`);
    }
  }

  return lines.join("\n");
}

export function renderSummary(
  entry: CustomEntry,
  { expanded }: EntryRenderOptions,
  theme: SummaryTheme
): Component | undefined {
  const parsed = summarySchema.safeParse(entry.data);
  if (!parsed.success) return;

  return {
    // Rebuild styles on every render so theme changes do not retain old colors.
    render: (width) => new Text(summaryText(parsed.data, expanded, theme), 1, 0).render(width),
    invalidate() {}
  };
}
