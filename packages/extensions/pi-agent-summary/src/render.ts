import type { CustomEntry, EntryRenderOptions, Theme } from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text, type Component } from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { formatDuration, formatFinishTime, summarySchema, type RunSummary } from "./summary.ts";

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
  const lines = [
    theme.fg(
      "dim",
      `Worked for ${formatDuration(summary.durationMs)} · ${formatFinishTime(summary.finishedAt)}`
    )
  ];
  const parts: string[] = [];
  if (summary.bashCalls)
    parts.push(
      theme.fg("dim", `${summary.bashCalls} bash ${summary.bashCalls === 1 ? "call" : "calls"}`)
    );
  if (available.length)
    parts.push(
      theme.fg("dim", `${available.length} ${available.length === 1 ? "file" : "files"} changed`)
    );
  const counts = lineCounts(
    available.reduce((total, file) => total + file.added, 0),
    available.reduce((total, file) => total + file.removed, 0),
    theme
  );
  if (counts) parts.push(counts);
  const unavailable = summary.files.length - available.length;
  if (unavailable)
    parts.push(
      theme.fg(
        "muted",
        `Statistics unavailable for ${unavailable} ${unavailable === 1 ? "file" : "files"}`
      )
    );
  if (parts.length) lines.push(parts.join(separator));

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

export function createSummaryRenderer() {
  // Pi rebuilds entry components on invalidation. Keep local expansion across
  // rebuilds, but let changes to the global tool-output toggle take precedence.
  const states = new WeakMap<CustomEntry, { expanded: boolean; globalExpanded: boolean }>();

  return function renderSummary(
    entry: CustomEntry,
    { expanded }: EntryRenderOptions,
    theme: SummaryTheme
  ): Component | undefined {
    const parsed = summarySchema.safeParse(entry.data);
    if (!parsed.success) return;

    const previous = states.get(entry);
    const expansion =
      previous?.globalExpanded === expanded ? previous : { expanded, globalExpanded: expanded };
    states.set(entry, expansion);

    return new MouseRegion(
      {
        // Rebuild styles on every render so theme changes do not retain old colors.
        render: (width) =>
          new Text(summaryText(parsed.data, expansion.expanded, theme), 1, 0).render(width),
        invalidate() {}
      },
      (event) => {
        if (event.type !== "click" || event.button !== "left" || parsed.data.files.length === 0)
          return;
        expansion.expanded = !expansion.expanded;

        return { handled: true };
      }
    );
  };
}
