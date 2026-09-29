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
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { decodeNotice, noticeSchema } from "pi-nested-instructions/notices";

import type { SummaryNotice } from "../../contracts.ts";

type NoticeMessage = Parameters<MessageRenderer>[0];

type NoticeTheme = Pick<Theme, "fg" | "bold">;

const labels = { loaded: "Loaded", updated: "Updated", removed: "Removed instructions" };
const explanations = {
  loaded: "",
  updated: "Replaces the earlier instructions for this directory.",
  removed: "The earlier instructions for this directory no longer apply."
};

/** Only validated persisted facts contribute counts; never infer actions from prose. */
export function noticeSummary(details: unknown): SummaryNotice | undefined {
  const parsed = noticeSchema.safeParse(details);
  if (!parsed.success) return undefined;
  const notice = parsed.data;
  const removed = notice.action === "removed";

  return {
    category: {
      id: `pi-nested-instructions:${notice.action}`,
      count: {
        one: removed
          ? "removed instructions from {n} dir"
          : `${notice.action} {n} instruction file`,
        other: removed
          ? "removed instructions from {n} dirs"
          : `${notice.action} {n} instruction files`
      }
    },
    identity: removed ? notice.directory : (notice.path ?? notice.directory)
  };
}

function headerRows(
  label: string,
  file: string | undefined,
  width: number,
  hasChildren: boolean,
  theme: NoticeTheme
): string[] {
  const title = `${theme.fg("accent", TUI_GLYPHS.bullet)} ${theme.fg("accent", theme.bold(label))}`;
  if (!file) return new Text(title, 0, 0).render(width);
  const indent = visibleWidth(title) + 1;
  const inline = width - indent >= 4;
  const rows = new Text(theme.fg("text", compactDisplayText(file)), 0, 0).render(
    inline ? width - indent : Math.max(1, width - 4)
  );
  const continuation = {
    width,
    indent: 2,
    style: (text: string) => theme.fg("dim", text),
    hasChildren
  };
  if (!inline)
    return [...new Text(title, 0, 0).render(width), ...renderTreeContinuation(rows, continuation)];

  return [
    `${title} ${rows[0] ?? ""}`,
    ...renderTreeContinuation(
      rows.slice(1).map((row) => " ".repeat(indent - 4) + row),
      continuation
    )
  ];
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
          if (body) child = markdown.render(innerWidth);
          else if (!explanation)
            child = new Text(theme.fg("dim", "Empty instruction file."), 0, 0).render(innerWidth);
          const hasChildren = expansion.expanded && child.length > 0;
          const lines = headerRows(label, file, width, hasChildren, theme);
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
