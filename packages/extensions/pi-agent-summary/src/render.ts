import type { CustomEntry, EntryRenderOptions, Theme } from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";
import { formatDuration } from "@pi-mono/libs/tui/duration";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapHangingRows } from "@pi-mono/libs/tui/text-budget";

import { summarySchema, type RunSummary } from "./summary.ts";

type SummaryTheme = Pick<Theme, "fg" | "bold">;

const milestoneMarker = "◆";

const finishTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
});

function countSegment(
  { verb, singular, plural, count }: Omit<NonNullable<RunSummary["counters"]>[number], "id">,
  theme: SummaryTheme
): string {
  // Bold's reset also ends dim, so the noun takes its own dim style.
  return [
    theme.fg("dim", verb),
    theme.bold(theme.fg("dim", String(count))),
    theme.fg("dim", count === 1 ? singular : plural)
  ].join(" ");
}

function summaryLine(summary: RunSummary, expanded: boolean, theme: SummaryTheme): string {
  const parts: string[] = [];
  const rate =
    summary.throughput &&
    ((summary.throughput.outputTokens / summary.throughput.durationMs) * 1000).toFixed(1);
  // Bold's reset also ends dim, so the text after the rate takes its own dim style.
  const throughput = (value: string, before: string, after: string) =>
    `${before && theme.fg("dim", before)}${theme.bold(theme.fg("dim", value))}${theme.fg("dim", ` tok/s${after}`)}`;

  if (summary.models) {
    const model = compactDisplayText(
      summary.models
        .map(
          ({ provider, id, thinkingLevel }) =>
            `${provider}/${id}${thinkingLevel ? `:${thinkingLevel}` : ""}`
        )
        .join(" → ")
    );
    parts.push(rate ? throughput(rate, `${model} (`, ")") : theme.fg("dim", model));
  }

  parts.push(
    theme.fg(
      "dim",
      `${formatDuration(summary.durationMs)}${expanded ? ` (${finishTimeFormatter.format(summary.finishedAt)})` : ""}`
    )
  );

  if (!summary.models && rate) parts.push(throughput(rate, "", ""));

  if (summary.bashCalls)
    parts.push(
      countSegment(
        { verb: "ran", singular: "command", plural: "commands", count: summary.bashCalls },
        theme
      )
    );
  for (const { verb, singular, plural, count } of summary.counters ?? [])
    parts.push(
      countSegment(
        {
          verb: compactDisplayText(verb),
          singular: compactDisplayText(singular),
          plural: compactDisplayText(plural),
          count
        },
        theme
      )
    );

  return parts.join(theme.fg("dim", " · "));
}

export function createSummaryRenderer() {
  // Pi rebuilds entry components on invalidation. Keep local expansion across rebuilds, but let changes to the global tool-output toggle take precedence.
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
    // Each TUI frame renders every chat entry; theme changes clear the cache through invalidate().
    let cache: { width: number; expanded: boolean; lines: string[] } | undefined;

    return new MouseRegion(
      {
        render: (width) => {
          if (width < 1) return [];
          if (cache?.width === width && cache.expanded === expansion.expanded) return cache.lines;

          const heading = summaryLine(parsed.data, expansion.expanded, theme);
          const marker = expansion.expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
          const style = (text: string) => theme.fg("dim", text);
          // The first row fits beside the marker; the rest wrap in the tree body.
          const [first = "", ...wrapped] = wrapHangingRows(
            heading,
            Math.max(1, width - 2),
            Math.max(1, width - 4)
          );

          const markedRows = (text: string, glyph: string) =>
            new Text(text, 0, 0).render(Math.max(1, width - 2)).map((line, index) => {
              const prefix = index === 0 ? `${glyph} ` : "  ";

              return truncateToWidth(prefix + line, width, "");
            });

          const lines = [
            ...(parsed.data.milestones ?? []).flatMap((text) =>
              markedRows(
                theme.fg("text", compactDisplayText(text)),
                theme.fg("accent", milestoneMarker)
              )
            ),
            truncateToWidth(`${theme.fg("dim", marker)} ${first}`, width, ""),
            ...renderTreeContinuation(wrapped, { width, indent: 2, style })
          ];
          cache = { width, expanded: expansion.expanded, lines };

          return lines;
        },
        invalidate() {
          cache = undefined;
        }
      },
      (event) => {
        if (event.type !== "click" || event.button !== "left") return;
        expansion.expanded = !expansion.expanded;

        return { handled: true };
      }
    );
  };
}
