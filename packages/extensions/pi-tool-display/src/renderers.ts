import {
  getLanguageFromPath,
  highlightCode,
  keyText,
  renderDiff,
  type AgentToolResult,
  type Theme,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { bodyWidth, compactRows, displayText, prefixRows, wrapRows } from "./layout.ts";
import {
  diffStatistics,
  invocationDetail,
  record,
  resultNotices,
  resultText,
  stringField,
  toolFamily,
  type ToolFamily,
} from "./presentation.ts";

export type { ToolFamily } from "./presentation.ts";

type DisplayTheme = Pick<Theme, "fg" | "bold">;

// Pi 0.85.1 does not export ToolRenderContext from its package root.
type HostContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type DisplayContext = Omit<HostContext, "args" | "state"> & { args: unknown; state: unknown };

export interface ToolDisplayRenderers {
  renderShell: "self";
  renderCall(args: unknown, theme: DisplayTheme, context: DisplayContext): Component;
  renderResult(
    result: AgentToolResult<unknown>,
    options: { expanded: boolean; isPartial: boolean },
    theme: DisplayTheme,
    context: DisplayContext,
  ): Component;
}

const verbs: Record<ToolFamily, [string, string]> = {
  read: ["Reading", "Read"],
  search: ["Searching", "Searched"],
  list: ["Listing", "Listed"],
  shell: ["Running", "Ran"],
  edit: ["Editing", "Edited"],
  write: ["Writing", "Wrote"],
  invocation: ["Calling", "Called"],
};

/** Cache only rendered rows; do not accumulate streamed output. */
class DisplayComponent implements Component {
  private width: number | undefined;
  private rows: string[] | undefined;

  constructor(private project: (width: number) => string[]) {}

  update(project: (width: number) => string[]): void {
    this.project = project;
    this.invalidate();
  }

  render(width: number): string[] {
    if (width < 1) return [];
    if (this.width !== width || this.rows === undefined) {
      this.width = width;
      this.rows = this.project(width);
    }
    return this.rows;
  }

  invalidate(): void {
    // Recompute styled rows: renderDiff and highlightCode use Pi's current global theme.
    this.width = undefined;
    this.rows = undefined;
  }
}

function component(context: DisplayContext, project: (width: number) => string[]): Component {
  if (context.lastComponent instanceof DisplayComponent) {
    context.lastComponent.update(project);
    return context.lastComponent;
  }
  return new DisplayComponent(project);
}

function expansionHint(): string {
  return `${keyText("app.tools.expand")} to expand`;
}

function heading(
  name: string,
  args: unknown,
  family: ToolFamily,
  context: DisplayContext,
  theme: DisplayTheme,
  width: number,
): string[] {
  const pending = context.isPartial;
  const verb = context.isError ? `Failed ${name}` : pending ? verbs[family][0] : verbs[family][1];
  const phase =
    pending && !context.executionStarted ? (context.argsComplete ? "Queued" : "Preparing") : verb;
  const quiet = family === "read" || family === "search" || family === "list";
  const color = context.isError ? "error" : pending ? "warning" : quiet ? "dim" : "success";
  const title = `${theme.fg(color, pending ? "◦" : "•")} ${theme.bold(phase)}`;
  const detail = theme.fg("accent", invocationDetail(name, args, family));
  const firstWidth = width - visibleWidth(title) - 1;
  let rows: string[];
  if (firstWidth >= 8) {
    // Reserve continuation indentation before wrapping so command text is never
    // lost when the gutter is applied to subsequent rows.
    const textRows = wrapRows(`${title} ${detail}`, Math.max(1, width - 4));
    rows = textRows.map((row, index) => (index === 0 ? row : `  │ ${row}`));
  } else {
    rows = [
      truncateToWidth(title, width, "…"),
      ...prefixRows(wrapRows(detail, bodyWidth(width)), width, "  │ ", "  │ "),
    ];
  }
  if (!context.expanded && rows.length > 3) {
    rows = [
      ...rows.slice(0, 3),
      truncateToWidth(theme.fg("dim", `  │ … (${expansionHint()})`), width, "…"),
    ];
  }
  if (family === "write" && context.expanded) {
    const content = stringField(record(args).content);
    rows.push(...prefixRows(wrapRows(highlight(content, args), bodyWidth(width)), width));
  }
  return rows.map((row) => truncateToWidth(row, width, ""));
}

function highlight(text: string, args: unknown): string {
  const path = stringField(record(args).path ?? record(args).file_path);
  const language = getLanguageFromPath(path);
  // Bound highlighting cost without truncating retained output.
  if (!language || text.length > 512 * 1024) return text;
  const lines = text.split("\n");
  if (lines.length > 10_000 || lines.some((line) => line.length > 4096)) {
    return text;
  }
  return highlightCode(text, language).join("\n");
}

interface OutputOptions {
  expanded: boolean;
  maximum?: number;
  styled?: boolean;
  isError?: boolean;
  firstPrefix?: string;
}

function outputRows(
  text: string,
  width: number,
  theme: DisplayTheme,
  { expanded, maximum = 5, styled = false, isError = false, firstPrefix = "  └ " }: OutputOptions,
): string[] {
  const available = bodyWidth(width);
  const rows = wrapRows(text, available);
  const visible = expanded ? rows : compactRows(rows, maximum, available, expansionHint());
  return prefixRows(
    visible.map((row) => (styled ? row : theme.fg(isError ? "error" : "muted", row))),
    width,
    firstPrefix,
  );
}

function resultRows(
  result: AgentToolResult<unknown>,
  family: ToolFamily,
  context: DisplayContext,
  theme: DisplayTheme,
  width: number,
): string[] {
  const text = resultText(result);
  const notices = resultNotices(result.details);
  let rows: string[];
  const diff = stringField(record(result.details).diff);
  if (family === "edit" && diff && !context.isError) {
    rows = [
      ...prefixRows(wrapRows(theme.fg("muted", diffStatistics(diff)), bodyWidth(width)), width),
      ...outputRows(renderDiff(diff), width, theme, {
        expanded: context.expanded,
        maximum: 12,
        styled: true,
        firstPrefix: "    ",
      }),
    ];
  } else if (family === "read" && !context.isPartial && !context.isError && !context.expanded) {
    const images = result.content.filter((block) => block.type === "image").length;
    const summary =
      images > 0
        ? `${images} image(s)`
        : text
          ? `${text.split("\n").length} lines returned`
          : "Empty file";
    rows = prefixRows(
      wrapRows(theme.fg("dim", `${summary} (${expansionHint()})`), bodyWidth(width)),
      width,
    );
  } else {
    const source =
      family === "read" && !context.isError && context.expanded
        ? highlight(text, context.args)
        : text;
    rows = outputRows(
      source || (context.isPartial ? "Waiting for output…" : "No output"),
      width,
      theme,
      {
        expanded: context.expanded,
        styled: source !== text,
        isError: context.isError,
        firstPrefix:
          family === "write" && context.expanded && stringField(record(context.args).content)
            ? "    "
            : "  └ ",
      },
    );
  }
  for (const notice of notices) {
    rows.push(
      ...prefixRows(wrapRows(theme.fg("warning", notice), bodyWidth(width)), width, "    "),
    );
  }
  return rows;
}

/** Opt-in rendering for custom/MCP tools; spread after the original definition to preserve execution. */
export function createToolDisplayRenderers(
  name: string,
  family: ToolFamily = toolFamily(name),
): ToolDisplayRenderers {
  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      return component(context, (width) =>
        heading(displayText(name), args, family, context, theme, width),
      );
    },
    renderResult(result, options, theme, context) {
      const current = { ...context, ...options };
      return component(context, (width) => resultRows(result, family, current, theme, width));
    },
  };
}
