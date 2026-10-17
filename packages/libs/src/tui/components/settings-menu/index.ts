import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

import { compactDisplayText, displayText } from "../../terminal-text/index.ts";
import { renderHintFooter } from "../hint-footer/index.ts";
import { renderOverflowBorder } from "../text-preview/index.ts";
import { renderWindowedList } from "../windowed-list/index.ts";

export type SettingsMenuItem = {
  key: string;
  label: string;
  description?: string;
  disabled?: boolean;
  gapBefore?: boolean;
};

export type SettingsMenuScope = {
  id: string;
  label: string;
  destination: string;
  isSet: boolean;
  dirty: boolean;
};

export type SettingsFeedback = {
  severity: "success" | "warning" | "error";
  summary: string;
  detail?: string;
};

export function settingsLoadFeedback(warnings: readonly string[]): SettingsFeedback | undefined {
  return warnings.length
    ? {
        severity: "warning",
        summary: "Settings warning. Using fallback.\nCheck files; fix and reopen.",
        detail: warnings.join("\n")
      }
    : undefined;
}

export function settingsSaveFeedback(
  globalOverride: boolean,
  warnings: readonly string[] = []
): SettingsFeedback {
  let summary = globalOverride
    ? "Saved globally.\nProject override remains active."
    : "Saved and applied.";
  if (warnings.length)
    summary = `${globalOverride ? "Saved; project override active." : "Saved and applied."}\nSettings warning. Check files.`;

  return {
    severity: warnings.length ? "warning" : "success",
    summary,
    ...(warnings.length ? { detail: warnings.join("\n") } : {})
  };
}

export function settingsSaveFailure(error: unknown): SettingsFeedback {
  const [reason, ...detail] = displayText(
    error instanceof Error ? error.message : "Check settings access and retry."
  ).split("\n");

  return {
    severity: "error",
    summary: `Save failed. Draft retained.\n${reason}`,
    ...(detail.length ? { detail: detail.join("\n") } : {})
  };
}

type SettingsMenuOptions = {
  width: number;
  height: number;
  theme: Pick<Theme, "fg" | "bold">;
  title: string;
  scopes: readonly SettingsMenuScope[];
  scope: string;
  items: readonly SettingsMenuItem[];
  selected: number;
  emptyLabel: string;
  hints: readonly string[];
  feedback?: SettingsFeedback | undefined;
};

type Frame = Pick<SettingsMenuOptions, "width" | "height" | "theme">;

function textLines(frame: Frame, value: string): string[] {
  return wrapTextWithAnsi(value, Math.max(1, frame.width - 4)).map((line) => `  ${line}`);
}

/** Hint regions own their leading blank row; maxRows counts only the hints themselves. */
function hints(frame: Frame, values: readonly string[], maxRows: number): string[] {
  const rows = renderHintFooter({
    width: frame.width,
    maxRows,
    hints: values,
    padding: "  ",
    separator: " · ",
    style: (value) => frame.theme.fg("dim", value)
  });

  return rows.length ? ["", ...rows] : [];
}

function border(frame: Frame, prefix = ""): string {
  return renderOverflowBorder(frame.width, {
    color: (value) => frame.theme.fg("border", value),
    direction: "↓",
    hidden: 0,
    prefix
  });
}

function scopeLines(options: SettingsMenuOptions, activeOnly = false): string[] {
  const { theme } = options;
  const scopes = options.scopes.filter((scope) => !activeOnly || scope.id === options.scope);

  return renderHintFooter({
    width: options.width,
    maxRows: scopes.length,
    hints: scopes.map((scope, index) => {
      const label = `${compactDisplayText(scope.label)}${scope.dirty ? "*" : ""}${scope.isSet ? "" : " (not set)"}`;
      const active = scope.id === options.scope;

      return (
        (index ? "" : theme.fg("muted", "Scope: ")) + theme.fg(active ? "accent" : "muted", label)
      );
    }),
    padding: "  ",
    separator: theme.fg("muted", " | "),
    style: (value) => value
  });
}

function dirtyLines(options: SettingsMenuOptions): string[] {
  const active = options.scopes.find((scope) => scope.id === options.scope);
  const otherDirty = options.scopes.some((scope) => scope !== active && scope.dirty);
  if (active?.dirty)
    return [
      options.theme.fg(
        "warning",
        `  Unsaved changes${otherDirty ? " · other scope also edited" : ""}`
      )
    ];

  return otherDirty ? [options.theme.fg("warning", "  Unsaved draft in other scope")] : [];
}

function feedbackLines(options: SettingsMenuOptions): string[] {
  const feedback = options.feedback;

  return feedback
    ? textLines(options, options.theme.fg(feedback.severity, displayText(feedback.summary)))
    : [];
}

function smallMenu(options: SettingsMenuOptions): string[] {
  const { theme, height } = options;
  const item = options.items[options.selected];
  const target = item
    ? theme.fg("accent", `→ ${compactDisplayText(item.label)}`)
    : theme.fg("muted", `  ${compactDisplayText(options.emptyLabel)}`);
  const controls = hints(options, options.hints.slice(0, 2), Math.min(2, height - 2));
  const available = height - 1 - controls.length;
  let context: string[] = [];

  if (available > 0) {
    context = options.feedback
      ? feedbackLines(options).slice(0, available)
      : [theme.fg("muted", "  Resize for more settings")];
    if (options.feedback && context.length < available) context.unshift("");
  }

  return [target, ...context, ...controls];
}

function frameLayout(options: SettingsMenuOptions, compact: boolean) {
  const { theme, height } = options;
  const title = theme.fg("accent", theme.bold(`  ${compactDisplayText(options.title)} `));
  const scope = scopeLines(options);
  const destination = options.scopes.find((entry) => entry.id === options.scope)?.destination ?? "";
  let header = compact
    ? [border(options, title), ...scope]
    : [
        border(options),
        title,
        "",
        ...scope,
        theme.fg("muted", `  Settings: ${compactDisplayText(destination)}`),
        ""
      ];
  let footer = hints(options, options.hints, 3);
  const outcome = feedbackLines(options).slice(0, compact ? 2 : 4);
  let outcomeGap = outcome.length ? 1 : 0;
  let draft = dirtyLines(options);
  let endRows = 1;
  // Multiple items need room for either two rows or a selected row and its pagination.
  const minimumBody = options.items.length > 1 ? 2 : 1;
  const frameBudget = height - minimumBody;
  const reserved = () =>
    header.length + footer.length + outcome.length + outcomeGap + draft.length + endRows;

  // Drop decoration before scope context; preserve selection, pagination, recovery and controls.
  if (reserved() > frameBudget) outcomeGap = 0;
  if (reserved() > frameBudget) draft = [];
  if (reserved() > frameBudget) endRows = 0;
  if (reserved() > frameBudget && scope.length > 1)
    header = [border(options, title), ...scopeLines(options, true)];

  while (reserved() > frameBudget && footer.length > 2) footer = footer.slice(0, -1);

  if (reserved() > frameBudget)
    header = header.slice(0, Math.max(0, frameBudget - (reserved() - header.length)));

  return {
    header,
    footer,
    outcome: outcomeGap ? ["", ...outcome] : outcome,
    draft,
    endRows,
    available: Math.max(1, height - reserved())
  };
}

function menuList(options: SettingsMenuOptions, compact: boolean, available: number) {
  const { theme, items, selected, width } = options;

  // Gaps depend on the centred window, so try at most eight row counts.
  for (let maxRows = Math.min(8, available); ; maxRows--) {
    const list = renderWindowedList({
      items,
      selectedIndex: selected,
      maxRows,
      width,
      theme: {
        selectedPrefix: (value) => theme.fg("accent", value),
        selectedText: (value) => theme.fg("accent", value),
        description: (value) => theme.fg("muted", value),
        scrollInfo: (value) => theme.fg("muted", value),
        noMatch: (value) => theme.fg("muted", value)
      },
      format: (visible) => ({
        items: visible.map((item) => {
          const description = compactDisplayText(item.description ?? "");
          let label = compactDisplayText(item.label);
          if (width <= 40 && description) label += ` · ${description}`;
          if (item.disabled) label = theme.fg("dim", label);

          return { value: item.key, label, description };
        }),
        layout: {
          minPrimaryColumnWidth: 8,
          maxPrimaryColumnWidth: 38,
          truncatePrimary: ({ text, maxWidth }) => truncateToWidth(text, maxWidth)
        }
      })
    });
    const gaps = compact
      ? 0
      : items.slice(list.start + 1, list.start + list.count).filter((item) => item.gapBefore)
          .length;
    const paginationRows = items.length > list.count ? 1 : 0;
    if (maxRows === 1 || list.count + gaps + paginationRows <= available) return list;
  }
}

function feedbackDetails(options: SettingsMenuOptions, budget: number): string[] {
  const feedback = options.feedback;
  if (!feedback?.detail || budget < 1) return [];
  const lines = textLines(
    options,
    options.theme.fg(feedback.severity, displayText(feedback.detail))
  );
  const count = Math.min(3, budget);
  const result = lines.slice(0, count);
  if (lines.length > count)
    result[result.length - 1] = options.theme.fg("muted", "  … Resize for settings details");

  return result;
}

/** Shared presentation only. Consumers own drafts, input, and persistence. */
export function renderSettingsMenu(input: SettingsMenuOptions): string[] {
  const width = Math.max(0, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  if (!width || !height) return [];
  const options = { ...input, width, height };
  const { theme, items, selected } = options;
  const crop = (text: string) => truncateToWidth(text, width);
  // The normal minimum is 40x10. Smaller views retain the target/outcome and an honest exit route.
  if (height < 6) return smallMenu(options).map(crop);
  const compact = height < 18 || width < 60;
  const frame = frameLayout(options, compact);
  const list = menuList(options, compact, frame.available);
  const body = items.length
    ? list.lines.flatMap((line, index) =>
        !compact && index > 0 && items[list.start + index]?.gapBefore ? ["", line] : [line]
      )
    : textLines(options, theme.fg("muted", compactDisplayText(options.emptyLabel))).slice(
        0,
        frame.available
      );
  if (items.length > list.count) body.push(theme.fg("dim", `  (${selected + 1}/${items.length})`));
  const spare = frame.available - body.length;
  const details = compact ? [] : feedbackDetails(options, spare);

  return [
    ...frame.header,
    ...body,
    ...frame.draft,
    ...frame.outcome,
    ...details,
    ...frame.footer,
    ...(frame.endRows ? [border(options)] : [])
  ].map(crop);
}
