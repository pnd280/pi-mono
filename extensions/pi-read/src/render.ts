import {
  keyHint,
  type createReadToolDefinition,
  type Theme,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { Container, Text, type Component } from "@earendil-works/pi-tui";
import { highlightCodeSelection } from "@pi-mono/libs/tui/components/code-highlight";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import {
  interpretReadResult,
  retainedSelectionSchema,
  type ReadDocument,
  type SelectiveReadDetails
} from "./result.ts";
import { selectionLabel, type Selection } from "./selection.ts";

type NativeRead = ReturnType<typeof createReadToolDefinition>;

type ReadRenderers = Required<
  Pick<
    ToolDefinition<NativeRead["parameters"], SelectiveReadDetails | undefined, unknown>,
    "renderCall" | "renderResult"
  >
>;

const renderArgsSchema = z.object({
  path: z.string().optional().catch(undefined),
  offset: z.number().optional().catch(undefined),
  limit: z.number().optional().catch(undefined),
  selection: retainedSelectionSchema.optional().catch(undefined)
});

type RenderArgs = z.output<typeof renderArgsSchema>;

function readWindow(args: RenderArgs): string | undefined {
  if (args.offset === undefined && args.limit === undefined) return undefined;
  const start = Math.max(0, (args.offset ?? 1) - 1);
  const first = Math.trunc(start) + 1;
  if (args.limit === undefined) return `from line ${first}`;
  const last = Math.trunc(start + args.limit);
  if (last < first) return `from line ${first} · limit ${args.limit}`;

  return `lines ${first}-${last}`;
}

/** Style on first render and again after invalidation, so a theme change cannot retain old colors. */
function themedText(content: () => string): Component {
  let text: Text | undefined;

  return {
    render: (width) => (width > 0 ? (text ??= new Text(content(), 0, 0)).render(width) : []),
    invalidate() {
      text = undefined;
    }
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
  const ranges = selection ? document.select(selection).ranges : [];

  return themedText(() => {
    const rows: string[] = [];
    const styled =
      expanded || selection !== undefined
        ? highlightCodeSelection(document.lines.join("\n"), {
            path: path ?? "",
            maxBytes: expanded ? 64 * 1024 : 0,
            maxLines: 2000,
            maxLineBytes: 4096,
            ranges,
            mark: (text) => theme.bg("searchMatchBg", text) + theme.getBgAnsi("toolSuccessBg")
          })
        : undefined;

    if (expanded && styled) {
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
    if (selection && !styled?.hasSelection)
      rows.push(theme.fg("warning", "No selected text is visible in this read window."));

    return rows.join("\n");
  });
}

export function createReadRenderers(base: NativeRead): ReadRenderers {
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
      const args = renderArgsSchema.safeParse(context.args).data ?? {};
      const interpreted = interpretReadResult(result, args);
      const source =
        interpreted.preview.kind === "valid"
          ? { ...result, content: [...interpreted.sourceContent] }
          : result;
      const document = interpreted.document;

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
