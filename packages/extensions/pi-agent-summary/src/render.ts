import type { CustomEntry, EntryRenderOptions, Theme } from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { renderTree } from "@pi-mono/libs/tui/components/tree";
import { formatDuration } from "@pi-mono/libs/tui/duration";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import { summarySchema, type RunSummary } from "./summary.ts";

type SummaryTheme = Pick<Theme, "fg" | "bold">;

const finishTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
});

function lineCounts(added: number, removed: number, theme: SummaryTheme): string {
  const parts: string[] = [];
  if (added) parts.push(theme.fg("toolDiffAdded", `+${added}`));
  if (removed) parts.push(theme.fg("toolDiffRemoved", `-${removed}`));

  return parts.join(" ");
}

function summaryLines(
  summary: RunSummary,
  expanded: boolean,
  theme: SummaryTheme
): [string, ...string[]] {
  const separator = theme.fg("dim", " · ");
  const available = summary.files.filter((file) => file.status === "available");
  const parts: string[] = [];
  let throughput: string | undefined;

  if (summary.throughput) {
    const { outputTokens, durationMs } = summary.throughput;
    throughput = `${theme.bold(((outputTokens / durationMs) * 1000).toFixed(1))} tok/s`;
  }

  if (summary.models) {
    const model = compactDisplayText(
      summary.models
        .map(
          ({ provider, id, thinkingLevel }) =>
            `${provider}/${id}${thinkingLevel ? `:${thinkingLevel}` : ""}`
        )
        .join(" → ")
    );
    parts.push(theme.fg("dim", `${model}${throughput ? ` (${throughput})` : ""}`));
  }

  parts.push(
    theme.fg(
      "dim",
      `${formatDuration(summary.durationMs)}${expanded ? ` (${finishTimeFormatter.format(summary.finishedAt)})` : ""}`
    )
  );

  if (!summary.models && throughput) parts.push(theme.fg("dim", throughput));

  if (summary.bashCalls)
    parts.push(
      theme.fg(
        "dim",
        `ran ${theme.bold(String(summary.bashCalls))} ${summary.bashCalls === 1 ? "command" : "commands"}`
      )
    );
  if (available.length)
    parts.push(
      theme.fg(
        "dim",
        `edited ${theme.bold(String(available.length))} ${available.length === 1 ? "file" : "files"}`
      )
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
        `statistics unavailable for ${unavailable} ${unavailable === 1 ? "file" : "files"}`
      )
    );
  const lines: [string, ...string[]] = [parts.join(separator)];

  if (expanded) {
    for (const file of summary.files) {
      const path = theme.fg("dim", compactDisplayText(file.path));
      const detail =
        file.status === "available"
          ? lineCounts(file.added, file.removed, theme)
          : theme.fg("dim", compactDisplayText(file.reason));
      lines.push(`${path}${detail ? separator + detail : ""}`);
    }
  }

  return lines;
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
        render: (width) => {
          if (width < 1) return [];

          const [heading, ...files] = summaryLines(parsed.data, expansion.expanded, theme);
          const marker = expansion.expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
          const rows = new Text(heading, 0, 0).render(Math.max(1, width - 2)).map((line, index) => {
            const prefix = index === 0 ? `${theme.fg("dim", marker)} ` : "  ";

            return truncateToWidth(prefix + line, width, "");
          });

          return rows.concat(
            renderTree(
              files.map((file) => ({
                rows: new Text(file, 0, 0).render(Math.max(1, width - 4))
              })),
              { width, indent: 2, style: (text) => theme.fg("dim", text) }
            )
          );
        },
        invalidate() {}
      },
      (event) => {
        if (event.type !== "click" || event.button !== "left") return;
        expansion.expanded = !expansion.expanded;

        return { handled: true };
      }
    );
  };
}
