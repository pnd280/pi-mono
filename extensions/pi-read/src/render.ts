import type {
  createReadToolDefinition,
  KeybindingHints,
  Theme,
  ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { Container, Text, type Component } from "@earendil-works/pi-tui";
import { highlightCodeSelection } from "@pi-mono/libs/tui/components/code-highlight";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import {
  interpretReadResult,
  retainedSelectionSchema,
  windowArgumentSchema,
  type ReadDocument,
  type ReadWindow,
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
  offset: windowArgumentSchema.optional().catch(undefined),
  limit: windowArgumentSchema.optional().catch(undefined),
  selection: retainedSelectionSchema.optional().catch(undefined)
});

function readWindow(args: ReadWindow): string | undefined {
  if (args.offset === undefined && args.limit === undefined) return undefined;
  const start = Math.max(0, (args.offset ?? 1) - 1);
  const first = Math.trunc(start) + 1;
  if (args.limit === undefined) return `from line ${first}`;
  const last = Math.trunc(start + args.limit);
  if (last < first) return `from line ${first} · limit ${args.limit}`;

  return `lines ${first}-${last}`;
}

/** Style on first render and again after invalidation, so a theme change cannot retain old colours. */
function themedText(content: () => string): Component {
  let text: Text | undefined;

  return {
    render: (width) => (text ??= new Text(content(), 0, 0)).render(width),
    invalidate() {
      text = undefined;
    }
  };
}

function renderDocument({
  document,
  path,
  selection,
  theme,
  expanded,
  hints
}: {
  document: ReadDocument;
  path: string | undefined;
  selection: Selection | undefined;
  theme: Theme;
  expanded: boolean;
  hints: KeybindingHints;
}): Component {
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
      rows.push(hints.keyHint("app.tools.expand", "to expand"));
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

      if (
        context.isError ||
        options.isPartial ||
        !document ||
        (!args.selection && !readWindow(interpreted.window))
      ) {
        return (
          base.renderResult?.(source, options, theme, { ...context, lastComponent: undefined }) ??
          new Container()
        );
      }

      return renderDocument({
        document,
        path: args.path,
        selection: args.selection,
        theme,
        expanded: options.expanded,
        hints: context
      });
    }
  };
}
