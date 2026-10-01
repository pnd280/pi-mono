import {
  keyHint,
  type createReadToolDefinition,
  type Theme
} from "@earendil-works/pi-coding-agent";
import { Container, Text, type Component } from "@earendil-works/pi-tui";
import { highlightCodeSelection } from "@pi-mono/libs/tui/components/code-highlight";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import {
  selectSource,
  selectionLabel,
  selectionSchema,
  type Selection
} from "@pi-mono/utils/source-selection";
import { z } from "zod";

import { readDocument, sourceResult, type ReadDocument } from "./result.ts";
import type { SelectiveReadTool } from "./tool.ts";

const renderArgsSchema = z.object({
  path: z.string().optional().catch(undefined),
  offset: z.number().optional().catch(undefined),
  limit: z.number().optional().catch(undefined),
  selection: selectionSchema.optional().catch(undefined)
});

type RenderArgs = z.output<typeof renderArgsSchema>;

function readWindow(args: RenderArgs): string | undefined {
  if (args.offset === undefined && args.limit === undefined) return undefined;
  const first = Math.trunc(Math.max(0, (args.offset ?? 1) - 1)) + 1;
  if (args.limit === undefined || args.limit < 1) return `from line ${first}`;

  return `lines ${first}-${first + Math.trunc(args.limit) - 1}`;
}

/** Compute styles on render so invalidation cannot retain colors from an old theme. */
function themedText(content: () => string): Component {
  return {
    render: (width) => (width > 0 ? new Text(content(), 0, 0).render(width) : []),
    invalidate() {}
  };
}

function renderDocument(
  document: ReadDocument,
  path: string | undefined,
  selection: Selection | undefined,
  theme: Theme,
  expanded: boolean,
  windowed: boolean
): Component {
  const selected = selection
    ? selectSource(document.lines, document.firstLine, selection).lines
    : [];
  const ranges = selected.map((line) => ({
    line: line.index,
    start: line.before.length,
    end: line.before.length + line.text.length
  }));

  return themedText(() => {
    const rows: string[] = [];
    const styled = highlightCodeSelection(document.lines.join("\n"), {
      path: path ?? "",
      maxBytes: expanded ? 64 * 1024 : 0,
      maxLines: 2000,
      maxLineBytes: 4096,
      ranges,
      mark: (text) => theme.bg("searchMatchBg", text) + theme.getBgAnsi("toolSuccessBg")
    });

    if (expanded) {
      rows.push(...styled.text.split("\n").map((line) => theme.fg("toolOutput", line)));
    } else {
      const count = document.lines.length;
      const summary =
        selection || windowed
          ? ""
          : theme.fg("muted", `loaded ${count} ${count === 1 ? "line" : "lines"} · `);
      rows.push(summary + keyHint("app.tools.expand", "to expand"));
    }

    if (document.notice) rows.push(theme.fg("warning", displayText(document.notice)));
    if (selection && !styled.hasSelection)
      rows.push(theme.fg("warning", "No selected text is visible in this read window."));

    return rows.join("\n");
  });
}

export function createReadRenderers(
  base: ReturnType<typeof createReadToolDefinition>
): Required<Pick<SelectiveReadTool, "renderCall" | "renderResult">> {
  return {
    renderCall(raw, theme, context) {
      const args = renderArgsSchema.safeParse(raw).data ?? {};
      const window = readWindow(args);
      const selection = args.selection;
      if (!window && !selection && base.renderCall)
        return base.renderCall(raw, theme, { ...context, lastComponent: undefined });

      return themedText(() => {
        const details = [
          window,
          selection ? `selection ${selectionLabel(selection)}` : undefined
        ].filter(Boolean);

        return (
          theme.fg("toolTitle", theme.bold("read")) +
          " " +
          theme.fg("accent", displayText(args.path ?? "…")) +
          (details.length > 0 ? "\n" + theme.fg("muted", details.join(" · ")) : "")
        );
      });
    },
    renderResult(result, options, theme, context) {
      const source = sourceResult(result);
      const args = renderArgsSchema.safeParse(context.args).data ?? {};
      const document = readDocument(source, {
        ...(args.offset === undefined ? {} : { offset: args.offset }),
        ...(args.limit === undefined ? {} : { limit: args.limit })
      });

      if (context.isError || options.isPartial || !document) {
        return (
          base.renderResult?.(source, options, theme, { ...context, lastComponent: undefined }) ??
          new Container()
        );
      }

      return renderDocument(
        document,
        args.path,
        args.selection,
        theme,
        options.expanded,
        readWindow(args) !== undefined
      );
    }
  };
}
