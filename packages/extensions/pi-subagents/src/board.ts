import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";
import { formatTokenCount } from "@pi-mono/libs/tui/token-count";

import type { TaskRecord } from "./records.ts";
import { duration } from "./render.ts";
import type { Tasks } from "./tasks.ts";

/** Panel views, in Tab order. The last three also order the list. */
export const views = [
  { label: "all", match: (_task: TaskRecord) => true },
  { label: "running", match: (task: TaskRecord) => task.state === "active" && !task.background },
  { label: "background", match: (task: TaskRecord) => task.state === "active" && task.background },
  { label: "finished", match: (task: TaskRecord) => task.state === "inactive" }
] as const;

const groups = views.slice(1);

const groupOf = (task: TaskRecord) =>
  Math.max(
    0,
    groups.findIndex((group) => group.match(task))
  );

/**
 * One board row. `lead` holds the tree branch; `guides` prefixes the task's wrapped rows. It
 * continues the ancestors' guides and, for a task with children, the stem down to them.
 */
export type BoardEntry = {
  task: TaskRecord;
  group: number;
  lead: string;
  guides: string;
};

export type BoardRows = { lines: string[]; targets: (number | undefined)[] };

/**
 * Orders tasks as running, background, then finished. Each tree stays together in
 * the group of its most active task. Tasks whose parent is not listed, because it is
 * filtered out, are roots.
 */
export function boardEntries(rows: readonly TaskRecord[]): BoardEntry[] {
  const { guide, branch, lastBranch, horizontal } = TUI_GLYPHS.tree;
  const listed = new Set(rows.map((task) => task.task_id));

  // Branches hang from the parent's status glyph, so its wrapped rows can carry a stem to them.
  // `indent` holds the ancestors' continuing guides for every row below this task.
  const walk = (task: TaskRecord, lead: string, indent: string): BoardEntry[] => {
    const children = rows.filter((item) => item.parent_task_id === task.task_id);

    return [
      { task, group: 0, lead, guides: `${indent}${children.length ? guide : " "} ` },
      ...children.flatMap((child, index) => {
        const last = index === children.length - 1;

        return walk(
          child,
          `${indent}${last ? lastBranch : branch}${horizontal} `,
          `${indent}${last ? "   " : `${guide}  `}`
        );
      })
    ];
  };

  const trees = rows
    .filter((task) => !task.parent_task_id || !listed.has(task.parent_task_id))
    .map((root) => {
      const tree = walk(root, "", "");
      const group = Math.min(...tree.map((entry) => groupOf(entry.task)));

      return tree.map((entry) => ({ ...entry, group }));
    });

  return groups.flatMap((_, index) => trees.flat().filter((entry) => entry.group === index));
}

/** Background tasks have no shared marker; the half-filled circle separates them from foreground work. */
const BACKGROUND_GLYPH = "◐";

type Status = { glyph: string; color: Parameters<Theme["fg"]>[0]; label: string };

/** Completed tasks need no label: the check mark carries the outcome. */
function status(task: TaskRecord): Status {
  if (task.state === "active")
    return task.background
      ? { glyph: BACKGROUND_GLYPH, color: "warning", label: "" }
      : { glyph: TUI_GLYPHS.taskStatus.in_progress, color: "accent", label: "" };

  const { success, failure, cancelled } = TUI_GLYPHS.outcome;

  if (task.outcome === "completed") return { glyph: success, color: "success", label: "" };
  if (task.outcome === "failed") return { glyph: failure, color: "error", label: "failed" };

  return { glyph: cancelled, color: "error", label: "cancelled" };
}

/** The child's latest context use as `used/total`, with `?` for unknown use. */
export function contextLabel(task: TaskRecord): string {
  const { context } = task;
  if (!context) return "";
  const used = context.tokens === null ? "?" : formatTokenCount(context.tokens);

  return `${used}/${formatTokenCount(context.window)}`;
}

/**
 * Status label with the latest run's duration, the current tool of a direct child, and total
 * usage. `full` adds cache reads, writes, and the latest hit rate, and joins a three-decimal
 * cost to the tokens. `context` shows an active task's context use in place of its tokens.
 * Missing and zero values are left out.
 */
export function taskMetadata(
  tasks: Tasks,
  task: TaskRecord,
  { full = false, context = false } = {}
): string[] {
  const { label } = status(task);
  const end = task.state === "active" ? Date.now() : task.ended_at;
  const time = end === null ? "" : duration(end - task.started_at);
  const activity = task.state === "active" ? tasks.activity(task.task_id) : "";
  const live = context && task.state === "active" ? contextLabel(task) : "";
  const cost = !full && task.usage && task.usage.cost > 0 ? `$${task.usage.cost.toFixed(2)}` : "";

  return [
    [label, time].filter(Boolean).join(" "),
    compactDisplayText(activity),
    live || usageLabel(task, full),
    cost
  ].filter(Boolean);
}

/** Tokens, with cache use, the hit rate, and the cost when `full`. */
function usageLabel(task: TaskRecord, full: boolean): string {
  const usage = task.usage;
  if (!usage) return "";
  const counts: (readonly [string, number])[] = [
    ["↑", usage.input],
    ["↓", usage.output],
    ...(full
      ? ([
          ["R", usage.cache_read],
          ["W", usage.cache_write]
        ] as const)
      : [])
  ];
  const cached = usage.cache_read > 0 || usage.cache_write > 0;
  const hit =
    full && cached && task.cache_hit !== undefined ? `CH${task.cache_hit.toFixed(1)}%` : "";
  const cost = full && usage.cost > 0 ? `$${usage.cost.toFixed(3)}` : "";

  return (
    [
      ...counts
        .filter(([, count]) => count > 0)
        .map(([prefix, count]) => `${prefix}${formatTokenCount(count)}`),
      hit,
      cost
    ]
      .filter(Boolean)
      // Non-breaking spaces keep the group on one row when it fits.
      .join("\u00a0")
  );
}

/**
 * Renders one row per task: status, description, and the muted model, with the other muted
 * details aligned to the right edge. Narrow panels wrap a task under its description column and
 * continue the tree guides. `targets` maps each line to its entry index.
 */
export function renderBoard(
  theme: Theme,
  tasks: Tasks,
  entries: readonly BoardEntry[],
  selected: number,
  width: number
): BoardRows {
  const lines: string[] = [];
  const targets: (number | undefined)[] = [];

  entries.forEach(({ task, lead, guides }, index) => {
    const { glyph, color } = status(task);
    const isSelected = index === selected;
    const description = compactDisplayText(task.description);
    const cursor = isSelected ? theme.fg("accent", "→ ") : "  ";
    const model = compactDisplayText(`${task.model}:${task.thinking}`);
    const metadata = theme.fg("muted", taskMetadata(tasks, task, { context: true }).join(" · "));
    const first = `${cursor}${theme.fg("dim", lead)}${theme.fg(color, glyph)} `;
    const rest = `  ${theme.fg("dim", guides)}`;
    const title = isSelected ? theme.fg("accent", description) : description;
    const room = Math.max(1, width - visibleWidth(first));
    const left = `${title}${theme.fg("muted", ` · ${model}`)}`;
    const alignRight = (row: string, used = 0) =>
      `${" ".repeat(Math.max(0, room - used - visibleWidth(row)))}${row}`;
    const gap = visibleWidth(metadata) ? 1 : 0;
    // A row that does not fit keeps the model and the details on their own rows, without a
    // dangling separator. Wrapped details stay aligned to the right edge.
    const rows =
      visibleWidth(left) + gap + visibleWidth(metadata) <= room
        ? [gap ? `${left}${alignRight(metadata, visibleWidth(left))}` : left]
        : [
            ...wrapRows(title, room),
            ...wrapRows(theme.fg("muted", model), room),
            ...(gap ? wrapRows(metadata, room).map((row) => alignRight(row)) : [])
          ];

    rows.forEach((row, line) => {
      lines.push(truncateToWidth(`${line ? rest : first}${row}`, width, ""));
      targets.push(index);
    });
  });

  return { lines, targets };
}
