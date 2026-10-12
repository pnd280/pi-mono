import {
  getMarkdownTheme,
  type MessageRenderer,
  type MessageRenderOptions,
  type Theme
} from "@earendil-works/pi-coding-agent";
import { Markdown, MouseRegion, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  renderTree,
  renderTreeContinuation,
  type TreeItem
} from "@pi-mono/libs/tui/components/tree";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { decodeNotice } from "pi-nested-instructions/notices";

import { pathRows } from "./target-layout.ts";

type NoticeMessage = Parameters<MessageRenderer>[0];

type NoticeTheme = Pick<Theme, "fg" | "bold">;

const labels = {
  loaded: "Loaded instructions",
  updated: "Updated instructions",
  removed: "Removed instructions"
};
const explanations = {
  loaded: "",
  updated: "Replaces the earlier instructions for this directory.",
  removed: "The earlier instructions for this directory no longer apply."
};

function headerRows(
  label: string,
  file: string | undefined,
  width: number,
  expanded: boolean,
  hasChildren: boolean,
  theme: NoticeTheme
): string[] {
  const marker = expanded ? TUI_GLYPHS.expanded : TUI_GLYPHS.bullet;
  const title = `${theme.fg("accent", marker)} ${theme.fg("accent", theme.bold(label))}`;
  if (!file) return new Text(title, 0, 0).render(width);
  const indent = visibleWidth(title) + 1;
  const path = displayText(file);
  const continuation = {
    width,
    indent: 2,
    style: (text: string) => theme.fg("dim", text),
    hasChildren
  };
  // Paths wrap like tool-card targets, beside the label when at least four columns remain.
  const inline = pathRows(path, { width: width - indent, theme, expanded });
  if (inline)
    return [
      `${title} ${inline[0] ?? ""}`,
      ...renderTreeContinuation(
        inline.slice(1).map((row) => " ".repeat(Math.max(0, indent - 4)) + row),
        continuation
      )
    ];
  const rows =
    pathRows(path, { width: width - 4, theme, expanded }) ??
    new Text(theme.fg("text", path), 0, 0).render(Math.max(1, width - 4));

  return [...new Text(title, 0, 0).render(width), ...renderTreeContinuation(rows, continuation)];
}

export function createNoticeRenderer() {
  // Pi rebuilds renderers on invalidation. Preserve local expansion until the
  // global tool-output toggle changes.
  const states = new WeakMap<NoticeMessage, { expanded: boolean; globalExpanded: boolean }>();

  return function renderNotice(
    message: NoticeMessage,
    { expanded }: MessageRenderOptions,
    theme: NoticeTheme
  ) {
    const { notice, body } = decodeNotice(message);
    const file = notice?.displayPath;
    const explanation = notice ? explanations[notice.action] : "";
    const markdown = new Markdown(displayText(body), 0, 0, getMarkdownTheme());
    const previous = states.get(message);
    const expansion =
      previous?.globalExpanded === expanded ? previous : { expanded, globalExpanded: expanded };
    states.set(message, expansion);
    let headerHeight = 0;

    return new MouseRegion(
      {
        render(width) {
          if (width < 1) return [];
          const innerWidth = Math.max(1, width - 4);
          const label = notice ? labels[notice.action] : "Nested instructions";
          // The explanation describes the notice itself, so it continues the heading;
          // only the instruction body or empty-file note is a child branch.
          let child: string[] = [];

          if (expansion.expanded) {
            if (body) child = markdown.render(innerWidth);
            else if (!explanation)
              child = new Text(theme.fg("dim", "Empty instruction file."), 0, 0).render(innerWidth);
          }

          const hasChildren = expansion.expanded && child.length > 0;
          const lines = headerRows(label, file, width, expansion.expanded, hasChildren, theme);
          headerHeight = lines.length;
          const items: TreeItem[] = [];

          if (expansion.expanded) {
            if (explanation)
              lines.push(
                ...renderTreeContinuation(
                  new Text(theme.fg("dim", explanation), 0, 0).render(innerWidth),
                  {
                    width,
                    indent: 2,
                    style: (text) => theme.fg("dim", text),
                    hasChildren
                  }
                )
              );
            items.push({ rows: child });
          }

          lines.push(
            ...renderTree(items, { width, indent: 2, style: (text) => theme.fg("dim", text) })
          );

          return lines.map((line) => truncateToWidth(line, width, ""));
        },
        invalidate() {
          markdown.invalidate();
        }
      },
      (event) => {
        // Leave instruction selection and scrolling alone; only the header toggles.
        if (event.type !== "click" || event.button !== "left" || event.y >= headerHeight) return;
        expansion.expanded = !expansion.expanded;

        return { handled: true };
      }
    );
  };
}
