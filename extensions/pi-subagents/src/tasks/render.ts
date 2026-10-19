import { keyHint, type Theme, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { MouseRegion, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { formatDuration } from "@pi-mono/libs/tui/duration";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { displayText, sliceTerminalText } from "@pi-mono/libs/tui/terminal-text";
import { displayLine, wrapRows } from "@pi-mono/libs/tui/text-budget";
import { formatTokenCount } from "@pi-mono/libs/tui/token-count";
import { parseTaskEnvelope } from "@pi-mono/utils/task-envelope";
import { z } from "zod";

import { detailsSchema, type ToolDetails } from "../result.ts";

/** The task or job that a click on a card opens. */
export type CardState = { id?: string | undefined; bindingId?: string | undefined };

// Untyped arguments: Pi also draws replayed calls before the tool registers.
type Definition = ToolDefinition<ToolDefinition["parameters"], ToolDetails, CardState>;

type Renderers = Required<Pick<Definition, "renderCall" | "renderResult">>;

type Kind = "subagent" | "subagent_abort";

export type Result = {
  content: ReadonlyArray<{ type: string; text?: string }>;
  details?: unknown;
};

/** The latest values Pi passed to either slot of one row. */
type View = {
  args: unknown;
  result: Result | undefined;
  theme: Theme;
  expanded: boolean;
  partial: boolean;
  error: boolean;
  started: boolean;
  complete: boolean;
};

type Color = "dim" | "muted" | "warning" | "success" | "error" | "accent";

/** The facts of one card, before layout. */
type Facts = {
  description: string;
  status: string;
  color: Color;
  activity: string;
  identity: string;
  usage: string;
  /** A failure reason; a cancelled task uses `warning`. */
  error: { text: string; color: "error" | "warning" } | undefined;
  taskId: string | undefined;
  options: Array<[string, string]>;
  prompt: string;
  failed: boolean;
  cancelled: boolean;
  /** Collapsed cards preview a completed reply or a rejection. */
  preview: boolean;
};

// Streamed and replayed arguments can be partial; unknown fields are ignored.
const argsSchema = z.object({
  description: z.string().optional(),
  prompt: z.string().optional(),
  task_id: z.string().optional(),
  model: z.string().optional(),
  thinking: z.string().optional(),
  background: z.boolean().optional(),
  delivery: z.string().optional()
});

/** The label column; the widest label is `background`. */
const LABEL_WIDTH = 11;
const PREVIEW_LINES = 3;
const PROMPT_LINES = 10;
/** Collapsed cards show this many characters of an ID. */
const SHORT_ID = 8;

/** A recorded duration, or a running timer in whole seconds while `endedAt` is null. */
export function elapsed(startedAt: number, endedAt: number | null): string {
  if (endedAt !== null) return formatDuration(endedAt - startedAt);
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

  return seconds ? formatDuration(seconds * 1000) : "0s";
}

/** An ID as a collapsed card shows it; the cut must save more than the ellipsis. */
export function shortId(id: string, expanded: boolean): string {
  return expanded || id.length <= SHORT_ID + 1 ? id : `${id.slice(0, SHORT_ID)}…`;
}

/**
 * A dim label in a column of `labelWidth`, beside its wrapped value. Labels stack above their
 * values when the column would leave no room for a wide character.
 */
export function field(
  theme: Theme,
  label: string,
  value: string,
  width: number,
  labelWidth: number
): string[] {
  const column = width >= labelWidth + 2 ? labelWidth : 0;
  const rows = value ? wrapRows(value, width - column) : [""];
  const pad = " ".repeat(column);

  return column
    ? rows.map((row, index) => `${index ? pad : theme.fg("dim", label.padEnd(column))}${row}`)
    : [...wrapRows(theme.fg("dim", label), width), ...rows];
}

/** A card that opens its task or job on a left click. */
export function clickable(
  card: Component,
  state: CardState,
  open: (id: string, binding?: string) => void
): Component {
  return new MouseRegion(card, (event) => {
    if (!state.id || event.type !== "click" || event.button !== "left") return;
    open(state.id, state.bindingId);

    return { handled: true };
  });
}

/** Non-breaking spaces keep the group on one row when it fits. */
function usage({ usage }: ToolDetails): string {
  if (!Object.values(usage).some((value) => value > 0)) return "";

  return `↑${formatTokenCount(usage.input)}\u00a0↓${formatTokenCount(usage.output)}\u00a0$${usage.cost.toFixed(2)}`;
}

/** A status phrase, with its time when the card has one. */
const phrase = (text: string, preposition: string, time: string) =>
  time ? `${text} ${preposition} ${time}` : text;

/** The first line of the last non-empty text block. */
function lastLine(result: Result | undefined): string {
  return (
    result?.content
      .filter((block) => block.type === "text" && block.text !== undefined && block.text !== "")
      .at(-1)
      ?.text?.split(/\r?\n/)[0] ?? ""
  );
}

/** Returned calls describe their fixed acknowledgement, not the child's later state. */
function taskStatus(details: ToolDetails, time: string): Pick<Facts, "status" | "color"> {
  if (details.returned === "background")
    return {
      status:
        details.state === "queued"
          ? "↗ returned; task waits for capacity in background"
          : "↗ returned; task continues in background",
      color: "accent"
    };
  if (details.returned === "input")
    return {
      status:
        details.delivery === "steer"
          ? "↪ steered the running task"
          : "↪ input queued for the running task",
      color: "accent"
    };
  if (details.state === "queued")
    return { status: `${TUI_GLYPHS.queued} queued, waiting for capacity`, color: "warning" };
  if (details.state === "running")
    return { status: phrase("running", "for", time), color: "warning" };
  if (details.state === "completed")
    return {
      status: phrase(`${TUI_GLYPHS.outcome.success} completed`, "in", time),
      color: "success"
    };
  if (details.state === "cancelled")
    return {
      status: phrase(`${TUI_GLYPHS.outcome.cancelled} cancelled`, "after", time),
      color: "warning"
    };

  return { status: phrase(`${TUI_GLYPHS.outcome.failure} failed`, "after", time), color: "error" };
}

function options(background?: boolean, delivery?: string): Array<[string, string]> {
  const values: Array<[string, string]> = [];
  if (background) values.push(["background", "true"]);
  if (delivery === "steer") values.push(["delivery", "steer"]);

  return values;
}

type Args = z.infer<typeof argsSchema>;

/** Before details arrive, show only explicitly requested values. */
function pendingFacts(abort: boolean, view: View, args: Args, failed: boolean): Facts {
  let status = view.complete
    ? `${TUI_GLYPHS.queued} ${view.started ? "starting" : "waiting to run"}`
    : "preparing call";
  if (failed) status = `${TUI_GLYPHS.outcome.failure} failed`;

  return {
    description: (abort ? args.task_id : args.description) ?? "",
    status,
    color: failed ? "error" : "dim",
    activity: "",
    identity: abort ? "" : [args.model, args.thinking].filter(Boolean).join(":"),
    usage: "",
    error: undefined,
    taskId: args.task_id,
    options: abort ? [] : options(args.background, args.delivery),
    prompt: abort ? "" : (args.prompt ?? ""),
    failed,
    cancelled: false,
    preview: true
  };
}

function detailFacts(details: ToolDetails, failed: boolean) {
  return {
    description: details.description,
    identity: `${details.model}:${details.thinking}`,
    usage: usage(details),
    taskId: details.task_id,
    failed
  };
}

/** The abort call succeeded; its card reports the task it stopped. */
function abortFacts(details: ToolDetails, failed: boolean, time: string): Facts {
  return {
    ...detailFacts(details, failed),
    status: phrase(`${TUI_GLYPHS.outcome.cancelled} aborted`, "after", time),
    color: "success",
    activity: "",
    error: undefined,
    options: [],
    prompt: "",
    cancelled: false,
    preview: false
  };
}

function facts(kind: Kind, view: View, details: ToolDetails | undefined, time: string): Facts {
  const args = argsSchema.safeParse(view.args).data ?? {};
  const abort = kind === "subagent_abort";
  // A successful abort reports the cancelled task; a rejected call has no details.
  const failed =
    !view.partial &&
    (view.error || (!abort && (details?.state === "failed" || details?.state === "cancelled")));

  if (!details) return pendingFacts(abort, view, args, failed);
  if (abort) return abortFacts(details, failed, time);

  return taskFacts(view, args, details, failed, time);
}

function taskFacts(
  view: View,
  args: Args,
  details: ToolDetails,
  failed: boolean,
  time: string
): Facts {
  const cancelled = details.state === "cancelled";
  // An error outcome replaces the last reported state, such as an interrupted running call.
  const reason = details.error || (failed ? lastLine(view.result) : "");

  return {
    ...detailFacts(details, failed),
    ...(failed && !cancelled
      ? {
          status: phrase(`${TUI_GLYPHS.outcome.failure} failed`, "after", time),
          color: "error" as const
        }
      : taskStatus(details, time)),
    activity:
      view.partial && !details.returned && details.state === "running" ? details.activity : "",
    error: reason ? { text: reason, color: cancelled ? "warning" : "error" } : undefined,
    options: options(details.background, details.delivery),
    prompt: args.prompt ?? "",
    cancelled,
    preview: details.state === "completed" && !details.returned
  };
}

/** One Pi row: both slots read the same view and prepared rows. */
class CardRow {
  private view: View | undefined;
  private cache: { key: string; call: string[]; result: string[] } | undefined;

  constructor(private kind: Kind) {}

  update(view: View): void {
    this.view = view;
    this.cache = undefined;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  render(slot: "call" | "result", width: number): string[] {
    const view = this.view;
    if (!view || width < 1) return [];
    const details = detailsSchema.safeParse(view.result?.details).data;
    // Only a running card's clock changes between renders, once a second.
    const time =
      details && !details.returned && (details.ended_at !== null || view.partial)
        ? elapsed(details.started_at, details.ended_at)
        : "";
    const key = `${width}:${time}`;

    if (this.cache?.key !== key) {
      const card = facts(this.kind, view, details, time);
      this.cache = {
        key,
        call: this.headingRows(view, card, width),
        result: this.resultRows(view, card, details, width)
      };
    }

    return this.cache[slot];
  }

  /** The title, then one labelled row per fact. */
  private headingRows(view: View, card: Facts, width: number): string[] {
    const { theme } = view;
    // Prompt continuation rows follow the value column, which `field` drops when labels stack.
    const labelWidth = width >= LABEL_WIDTH + 2 ? LABEL_WIDTH : 0;
    const valueWidth = width - labelWidth;
    const pad = " ".repeat(labelWidth);
    const labelled = (label: string, value: string) =>
      field(theme, label, value, width, LABEL_WIDTH);

    const title = `${theme.fg("toolTitle", theme.bold(this.kind))} ${theme.fg("toolTitle", displayLine(card.description) || "…")}`;
    const activity = card.activity ? theme.fg("muted", ` · now ${displayLine(card.activity)}`) : "";
    // Style values before wrapping so continuation rows keep their colour.
    const rows = [
      ...wrapRows(title, width),
      ...labelled("status", theme.fg(card.color, displayLine(card.status)) + activity)
    ];
    const identity = displayLine(card.identity);
    if (identity) rows.push(...labelled("model", theme.fg("muted", identity)));
    if (card.usage) rows.push(...labelled("usage", theme.fg("muted", card.usage)));
    if (card.error)
      rows.push(...labelled("error", theme.fg(card.error.color, displayLine(card.error.text))));

    if (card.taskId) {
      const id = displayLine(card.taskId);
      rows.push(...labelled("task", theme.fg("muted", shortId(id, view.expanded))));
    }

    if (view.expanded) {
      for (const [name, value] of card.options)
        rows.push(...labelled(name, theme.fg("muted", displayLine(value))));

      if (card.prompt) {
        const retained = sliceTerminalText(card.prompt, 0, 16 * 1024).text;
        const lines = displayText(retained).split("\n");
        lines
          .slice(0, PROMPT_LINES)
          .forEach((line, index) =>
            rows.push(
              ...(index
                ? (line ? wrapRows(line, valueWidth) : [""]).map(
                    (row) => `${pad}${theme.fg("toolOutput", row)}`
                  )
                : labelled("prompt", line && theme.fg("toolOutput", line)))
            )
          );
        if (retained.length < card.prompt.length || lines.length > PROMPT_LINES)
          rows.push(`${pad}${theme.fg("dim", "… (prompt truncated)")}`);
      }
    }

    return rows.map((row) => truncateToWidth(row, width, ""));
  }

  /** The reply or rejection below a blank row; collapsed cards preview it only when `preview` is set. */
  private resultRows(
    view: View,
    card: Facts,
    details: ToolDetails | undefined,
    width: number
  ): string[] {
    const { theme, result } = view;
    if (!result || (!view.expanded && !card.preview)) return [];
    // The envelope repeats the card's facts; text that does not match the details stays intact.
    const text = displayText(
      result.content
        .flatMap((block) =>
          block.type === "text" && block.text !== undefined
            ? [
                (details &&
                  parseTaskEnvelope(block.text, { id: details.task_id, state: details.state })) ??
                  block.text
              ]
            : []
        )
        .join("\n")
    )
      .replace(/^(?:[^\S\n]*\n)+/, "")
      .trimEnd();
    if (!text && view.partial) return [];
    let color: "error" | "warning" | "toolOutput" = "toolOutput";
    if (card.failed) color = card.cancelled ? "warning" : "error";
    let rows: string[];

    if (!text) rows = [theme.fg("dim", "(no output)")];
    else {
      const lines = text.split("\n");
      // A hint must save space, so it never replaces a single line.
      const shown =
        view.expanded || lines.length <= PREVIEW_LINES + 1 ? lines.length : PREVIEW_LINES;
      rows = lines
        .slice(0, shown)
        .flatMap((line) => (line ? wrapRows(line, width) : [""]))
        .map((line) => theme.fg(color, line));
      if (shown < lines.length)
        rows.push(
          theme.fg("muted", `... (${lines.length - shown} more lines,`) +
            ` ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`
        );
    }

    return ["", ...rows].map((row) => truncateToWidth(row, width, ""));
  }
}

class CardSlot implements Component {
  constructor(
    private row: CardRow,
    private slot: "call" | "result"
  ) {}

  render(width: number): string[] {
    return this.row.render(this.slot, width);
  }

  invalidate(): void {
    this.row.invalidate();
  }
}

/** Cards in Pi's default tool box. A click on a card with a task opens it. */
export function createRenderers(
  open: (id: string, binding?: string) => void,
  kind: Kind = "subagent"
): Renderers {
  const rows = new WeakMap<CardState, { row: CardRow; result?: Result }>();

  const slot = (
    name: "call" | "result",
    context: Parameters<Renderers["renderCall"]>[2],
    view: Omit<View, "args" | "result" | "started" | "complete" | "error">,
    result?: Result
  ) => {
    let entry = rows.get(context.state);
    if (!entry) rows.set(context.state, (entry = { row: new CardRow(kind) }));
    if (result) entry.result = result;
    entry.row.update({
      ...view,
      args: context.args,
      result: entry.result,
      error: context.isError,
      started: context.executionStarted,
      complete: context.argsComplete
    });

    return clickable(new CardSlot(entry.row, name), context.state, open);
  };

  return {
    renderCall(args, theme, context) {
      return slot(
        "call",
        { ...context, args },
        { theme, expanded: context.expanded, partial: context.isPartial }
      );
    },
    renderResult(result, options, theme, context) {
      const details = detailsSchema.safeParse(result.details).data;
      // Both slots read the latest identity, including when Pi retains the call component.
      context.state.id = details?.task_id;
      context.state.bindingId = details?.binding_id;

      return slot(
        "result",
        context,
        { theme, expanded: options.expanded, partial: options.isPartial },
        result
      );
    }
  };
}
