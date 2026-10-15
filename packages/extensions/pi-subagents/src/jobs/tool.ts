import type { ExtensionToolContext, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { MouseRegion, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { textPrefix, wrapRows } from "@pi-mono/libs/tui/text-budget";
import { parseJobEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

import { clean, elapsed } from "../tasks/render.ts";
import {
  jobAbortInputSchema,
  jobAbortParameters,
  jobDetailsSchema,
  jobInputSchema,
  jobParameters,
  jobText,
  type JobAbortInput,
  type JobDetails,
  type JobInput
} from "./records.ts";
import type { Jobs } from "./registry.ts";

export type JobCardState = { jobId?: string | undefined; bindingId?: string | undefined };

type Kind = "job" | "job_abort";

// Untyped arguments: Pi also draws replayed calls before the tool registers.
type Definition = ToolDefinition<ToolDefinition["parameters"], JobDetails, JobCardState>;

type Renderers = Required<Pick<Definition, "renderCall" | "renderResult">>;

type Result = { content: ReadonlyArray<{ type: string; text?: string }>; details?: unknown };

// Streamed and replayed arguments can be partial; unknown fields are ignored.
const argsSchema = z.object({
  description: z.string().optional(),
  command: z.string().optional(),
  job_id: z.string().optional()
});

const LABEL_WIDTH = 9;
const COMMAND_LINES = 10;
const SHORT_ID = 8;

/** Rows built at each render from prepared text; builders fit each row to the width. */
class Rows implements Component {
  constructor(private build: (width: number) => string[]) {}

  render(width: number): string[] {
    return width < 1 ? [] : this.build(width);
  }

  invalidate(): void {}
}

/** Plain lines, wrapped and fitted once per width; theme colours stay out of this cache. */
class Wrapped {
  private cache: { width: number; rows: string[] } | undefined;

  constructor(private lines: readonly string[]) {}

  rows(width: number): string[] {
    if (this.cache?.width !== width)
      this.cache = {
        width,
        rows: this.lines.flatMap((line) =>
          line ? wrapRows(line, width).map((row) => truncateToWidth(row, width, "")) : [""]
        )
      };

    return this.cache.rows;
  }
}

function field(theme: Theme, label: string, value: string, width: number): string[] {
  const labelWidth = width >= LABEL_WIDTH + 2 ? LABEL_WIDTH : 0;
  const rows = value ? wrapRows(value, width - labelWidth) : [""];
  const pad = " ".repeat(labelWidth);

  return labelWidth
    ? rows.map((row, index) => `${index ? pad : theme.fg("dim", label.padEnd(labelWidth))}${row}`)
    : [...wrapRows(theme.fg("dim", label), width), ...rows];
}

const fit = (rows: string[], width: number) => rows.map((row) => truncateToWidth(row, width, ""));

/** The abort call succeeded; a job that ended first keeps its own outcome. */
function status(kind: Kind, details: JobDetails): { text: string; color: "accent" | "success" } {
  if (kind === "job" || details.state === "active")
    return { text: "↗ returned; job continues in background", color: "accent" };
  const time =
    details.ended_at === null ? "" : ` after ${elapsed(details.started_at, details.ended_at)}`;

  return details.outcome === "cancelled"
    ? { text: `${TUI_GLYPHS.outcome.cancelled} aborted${time}`, color: "success" }
    : { text: `already ${details.outcome}${time}`, color: "success" };
}

/** The call's title and command lines, prepared when the arguments or expansion change. */
function callRows(
  kind: Kind,
  args: unknown,
  expanded: boolean,
  theme: Theme
): (width: number) => string[] {
  const parsed = argsSchema.safeParse(args).data ?? {};
  const label = clean((kind === "job" ? parsed.description : parsed.job_id) ?? "") || "…";
  const lines =
    kind === "job" && parsed.command
      ? displayText(textPrefix(parsed.command, 16 * 1024)).split("\n")
      : [];
  const shown = lines.slice(0, expanded ? COMMAND_LINES : 1);
  const rest = new Wrapped(shown.slice(1));
  const pad = " ".repeat(LABEL_WIDTH);

  return (width) => {
    const rows = wrapRows(
      `${theme.fg("toolTitle", theme.bold(kind))} ${theme.fg("toolTitle", label)}`,
      width
    );
    if (shown[0] !== undefined)
      rows.push(...field(theme, "command", theme.fg("toolOutput", shown[0]), width));
    rows.push(
      ...rest
        .rows(Math.max(1, width - LABEL_WIDTH))
        .map((row) => `${pad}${theme.fg("toolOutput", row)}`)
    );
    if (shown.length < lines.length) rows.push(`${pad}${theme.fg("dim", "…")}`);

    return fit(rows, width);
  };
}

/** The result's labelled rows and body, prepared when the result or expansion change. */
function resultRows(
  kind: Kind,
  result: Result,
  details: JobDetails | undefined,
  expanded: boolean,
  error: boolean,
  theme: Theme
): (width: number) => string[] {
  const text = result.content
    .flatMap((block) => (block.type === "text" && block.text !== undefined ? [block.text] : []))
    .join("\n");

  if (!details) {
    const reason = error ? clean(text.split("\n")[0] ?? "") : undefined;

    return (width) =>
      reason === undefined
        ? []
        : fit(
            [
              ...field(
                theme,
                "status",
                theme.fg("error", `${TUI_GLYPHS.outcome.failure} failed`),
                width
              ),
              ...field(theme, "error", theme.fg("error", reason), width)
            ],
            width
          );
  }

  const { text: label, color } = status(kind, details);
  const id = clean(details.job_id);
  const shownId = expanded || id.length <= SHORT_ID + 1 ? id : `${id.slice(0, SHORT_ID)}…`;
  const log = clean(details.log_file);
  const body = expanded
    ? displayText(
        parseJobEnvelope(text, {
          id: details.job_id,
          state: details.state,
          ...(details.state === "inactive"
            ? { outcome: details.outcome, exit_code: details.exit_code }
            : {})
        }) ?? text
      ).trim()
    : "";
  const bodyRows = new Wrapped(body ? body.split("\n") : []);

  return (width) => {
    const rows = [
      ...field(theme, "status", theme.fg(color, label), width),
      ...field(theme, "job", theme.fg("muted", shownId), width)
    ];
    if (expanded) rows.push(...field(theme, "log", theme.fg("muted", log), width));

    return body ? [...fit(rows, width), "", ...bodyRows.rows(width)] : fit(rows, width);
  };
}

function clickable(
  rows: Component,
  state: JobCardState,
  open: (id: string, binding?: string) => void
): Component {
  return new MouseRegion(rows, (event) => {
    if (!state.jobId || event.type !== "click" || event.button !== "left") return;
    open(state.jobId, state.bindingId);

    return { handled: true };
  });
}

/** Cards in Pi's default tool box. A click on a card with a job opens its log. */
export function createJobRenderers(
  open: (id: string, binding?: string) => void,
  kind: Kind = "job"
): Renderers {
  return {
    renderCall(args, theme, context) {
      return clickable(
        new Rows(callRows(kind, args, context.expanded, theme)),
        context.state,
        open
      );
    },
    renderResult(result, options, theme, context) {
      const details = jobDetailsSchema.safeParse(result.details).data;
      // Both slots read the latest identity, including when Pi retains the call component.
      context.state.jobId = details?.job_id;
      context.state.bindingId = details?.binding_id;

      return clickable(
        new Rows(resultRows(kind, result, details, options.expanded, context.isError, theme)),
        context.state,
        open
      );
    }
  };
}

/** Where job results go: a supervisor that waits for results, or a run whose end stops its jobs. */
function jobDelivery(delivers: boolean): string {
  return delivers
    ? "The result arrives automatically when the command exits; do not sleep or poll."
    : "Jobs stop when your final reply ends this run. Use them only for processes you need during the run, such as a server you test. Run finite commands in the foreground.";
}

function jobStarted(logFile: string, delivers: boolean): string {
  return [
    `The job is running in the background. Its output goes to the log file ${logFile}`,
    jobDelivery(delivers),
    "Read the log file to check output while it runs. Stop the job with job_abort."
  ].join("\n");
}

/** Guidance for the model; `delivers` is false where the run's end stops its jobs. */
function jobGuidance(delivers: boolean): string {
  return [
    "Run a shell command in the background, such as a build, a test run, a server, or a watcher. Returns at once with the job_id and the path of a log file that receives the command's output.",
    jobDelivery(delivers),
    "Read the log file to check output while it runs. Stop a job with job_abort. Keep each process in the foreground of its command: a process that detaches from it is not stopped."
  ].join(" ");
}

export function createJobTool(
  jobs: Jobs,
  open: (id: string, binding?: string) => void,
  delivers: boolean
) {
  return {
    name: "job",
    label: "Job",
    exposure: "model-only",
    executionMode: "parallel",
    description: jobGuidance(delivers),
    parameters: jobParameters,
    ...createJobRenderers(open),
    async execute(
      _id: string,
      raw: JobInput,
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionToolContext
    ) {
      const parsed = jobInputSchema.safeParse(raw);
      // Pi's schema check does not see the timeout refinement; its message names the limit.
      if (!parsed.success)
        throw new Error(
          `Invalid job parameters: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`
        );
      // The job owns its abort controller, so a turn abort does not stop it.
      const details = await jobs.start(parsed.data, ctx);

      return {
        content: [
          {
            type: "text" as const,
            text: jobText(details, jobStarted(details.log_file, delivers), "Background job started")
          }
        ],
        details
      };
    }
  } satisfies ToolDefinition<typeof jobParameters, JobDetails, JobCardState>;
}

export function createJobAbortTool(jobs: Jobs, open: (id: string, binding?: string) => void) {
  return {
    name: "job_abort",
    label: "Abort job",
    exposure: "model-only",
    executionMode: "parallel",
    description:
      "Stop an active job only when its result is no longer needed. You do not receive its result.",
    parameters: jobAbortParameters,
    ...createJobRenderers(open, "job_abort"),
    async execute(_id: string, raw: JobAbortInput) {
      const parsed = jobAbortInputSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Invalid job_abort parameters");
      // The model gave up this job's result; a job that already exited keeps its result.
      const record = await jobs.abort(parsed.data.job_id, { drop: true });
      const details = jobs.details(record);
      let body = `The job is stopped.\n\nLog file: ${record.log_file}`;
      if (record.state === "inactive" && record.outcome !== "cancelled")
        body = `The job exited before the abort${record.error ? ` (${record.error})` : ""}. Its result arrives separately.`;

      return { content: [{ type: "text" as const, text: jobText(details, body) }], details };
    }
  } satisfies ToolDefinition<typeof jobAbortParameters, JobDetails, JobCardState>;
}
