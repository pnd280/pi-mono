import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";
import { formatTokenCount } from "@pi-mono/libs/tui/token-count";

import type { JobRecord } from "./job-records.ts";
import type { TaskRecord } from "./records.ts";
import { elapsed } from "./render.ts";
import type { Tasks } from "./tasks.ts";

/** Panel views, in Tab order. The last three also order the list. An active job is background work. */
export const views = [
  { label: "all", match: (_task: TaskRecord) => true, matchJob: (_job: JobRecord) => true },
  {
    label: "running",
    match: (task: TaskRecord) => task.state === "active" && !task.background,
    matchJob: (_job: JobRecord) => false
  },
  {
    label: "background",
    match: (task: TaskRecord) => task.state === "active" && task.background,
    matchJob: (job: JobRecord) => job.state === "active"
  },
  {
    label: "finished",
    match: (task: TaskRecord) => task.state === "inactive",
    matchJob: (job: JobRecord) => job.state === "inactive"
  }
] as const;

const groups = views.slice(1);

const groupOf = (task: TaskRecord) =>
  Math.max(
    0,
    groups.findIndex((group) => group.match(task))
  );

/**
 * One board row. `lead` holds the tree branch; `guides` prefixes the task's wrapped rows. It
 * continues the ancestors' guides and, for a task with children, the stem down to them. A job is
 * always a root row.
 */
export type BoardEntry = { group: number; lead: string; guides: string } & (
  | { kind: "task"; task: TaskRecord }
  | { kind: "job"; job: JobRecord }
);

/** The task or job ID of a row. */
export const entryId = (entry: BoardEntry): string =>
  entry.kind === "task" ? entry.task.task_id : entry.job.job_id;

export type BoardRows = { lines: string[]; targets: (number | undefined)[] };

/**
 * Orders tasks and jobs as running, background, then finished. Each tree stays together in
 * the group of its most active task. Tasks whose parent is not listed, because it is
 * filtered out, are roots. Jobs follow the tasks of their group.
 */
export function boardEntries(
  rows: readonly TaskRecord[],
  jobs: readonly JobRecord[] = []
): BoardEntry[] {
  const { guide, branch, lastBranch, horizontal } = TUI_GLYPHS.tree;
  const listed = new Set(rows.map((task) => task.task_id));

  // Branches hang from the parent's status glyph, so its wrapped rows can carry a stem to them.
  // `indent` holds the ancestors' continuing guides for every row below this task.
  type TaskEntry = BoardEntry & { kind: "task" };

  const walk = (task: TaskRecord, lead: string, indent: string): TaskEntry[] => {
    const children = rows.filter((item) => item.parent_task_id === task.task_id);

    return [
      {
        kind: "task" as const,
        task,
        group: 0,
        lead,
        guides: `${indent}${children.length ? guide : " "} `
      },
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
  const jobRows = jobs.map((job): BoardEntry => ({
    kind: "job",
    job,
    group: job.state === "active" ? 1 : 2,
    lead: "",
    guides: "  "
  }));

  return groups.flatMap((_, index) =>
    [...trees.flat(), ...jobRows].filter((entry) => entry.group === index)
  );
}

/** Background tasks have no shared marker; the half-filled circle separates them from foreground work. */
const BACKGROUND_GLYPH = "◐";

type Status = { glyph: string; color: Parameters<Theme["fg"]>[0]; label: string };

/**
 * Completed tasks need no label: the check mark carries the outcome. Outcome glyphs name a
 * cancellation in `error`, like pi-tool-display headings; card status details use `warning`.
 */
export function status(task: Pick<TaskRecord, "state" | "outcome" | "background">): Status {
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
 * Status label with the latest run's duration, the current tool of a direct child, the context
 * use of an active task or the tokens of an inactive one, and the cost. Missing and zero values
 * are left out.
 */
function taskMetadata(tasks: Tasks, task: TaskRecord): string[] {
  const { label } = status(task);
  // A run without an `end` has no recorded duration.
  let time = "";
  if (task.state === "active") time = elapsed(task.started_at, null);
  else if (task.ended_at !== null) time = elapsed(task.started_at, task.ended_at);
  const activity = task.state === "active" ? tasks.activity(task.task_id) : "";
  const live = task.state === "active" ? contextLabel(task) : "";
  const cost = task.usage && task.usage.cost > 0 ? `$${task.usage.cost.toFixed(2)}` : "";

  return [
    [label, time].filter(Boolean).join(" "),
    compactDisplayText(activity),
    // Non-breaking spaces keep the group on one row when it fits.
    live || usageParts(task, false).join("\u00a0"),
    cost
  ].filter(Boolean);
}

/** A job runs in the background; its rows use the background task glyph. */
const jobStatus = (job: JobRecord) =>
  status({
    state: job.state,
    outcome: job.state === "inactive" ? job.outcome : null,
    background: true
  });

/** Status label with the elapsed time or duration, and the exit code when there is one. */
function jobMetadata(job: JobRecord): string[] {
  let time = "";
  if (job.state === "active") time = elapsed(job.started_at, null);
  else if (job.ended_at !== null) time = elapsed(job.started_at, job.ended_at);

  return [
    [jobStatus(job).label, time].filter(Boolean).join(" "),
    job.exit_code === null ? "" : `exit ${job.exit_code}`
  ].filter(Boolean);
}

/** Tokens, with cache use, the hit rate, and the three-decimal cost when `full`. */
export function usageParts(task: TaskRecord, full: boolean): string[] {
  const usage = task.usage;
  if (!usage) return [];
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

  return [
    ...counts
      .filter(([, count]) => count > 0)
      .map(([prefix, count]) => `${prefix}${formatTokenCount(count)}`),
    hit,
    cost
  ].filter(Boolean);
}

/**
 * Renders one row per task or job: status, description, and the muted model or `job`, with the
 * other muted details aligned to the right edge. Narrow panels wrap a row under its description
 * column and continue the tree guides. `targets` maps each line to its entry index.
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

  entries.forEach((entry, index) => {
    const { lead, guides } = entry;
    const { glyph, color } = entry.kind === "task" ? status(entry.task) : jobStatus(entry.job);
    const isSelected = index === selected;
    const description = compactDisplayText(
      entry.kind === "task" ? entry.task.description : entry.job.description
    );
    const cursor = isSelected ? theme.fg("accent", "→ ") : "  ";
    const model =
      entry.kind === "task"
        ? compactDisplayText(`${entry.task.model}:${entry.task.thinking}`)
        : "job";
    const metadata = theme.fg(
      "muted",
      (entry.kind === "task" ? taskMetadata(tasks, entry.task) : jobMetadata(entry.job)).join(" · ")
    );
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
