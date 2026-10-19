import { truncateToWidth } from "@earendil-works/pi-tui";

import { TUI_GLYPHS } from "../../glyphs/index.ts";

/** An item with measured content. Keep related notices in its rows. */
export type TreeItem = {
  readonly rows: readonly string[];
};

type TreeStyleOptions = {
  width: number;
  /** Leading columns before the two-column connector. Defaults to zero. */
  indent?: number;
  style?: (text: string) => string;
};

export type TreeOptions = TreeStyleOptions & {
  /** Join fragments rendered by separate components without moving their content. */
  followingSibling?: boolean;
};

export type TreeContinuationOptions = TreeStyleOptions & {
  hasChildren?: boolean;
};

function continuationPrefix(hasFollowingSibling: boolean): string {
  return hasFollowingSibling ? `${TUI_GLYPHS.tree.guide} ` : "  ";
}

/** Assign connectors only after visible siblings are known. Empty items have no connector. */
export function renderTree(items: readonly TreeItem[], options: TreeOptions): string[] {
  const { width, indent = 0, style = (text) => text, followingSibling = false } = options;
  if (width < 1) return [];
  const prefix = " ".repeat(indent);
  const visible = items.filter((item) => item.rows.length > 0);

  return visible.flatMap((item, index) => {
    const more = index < visible.length - 1 || followingSibling;
    const continuation = prefix + continuationPrefix(more);

    const branch = more ? `${TUI_GLYPHS.tree.branch} ` : `${TUI_GLYPHS.tree.lastBranch} `;

    return item.rows.map((row, offset) =>
      truncateToWidth(style(offset === 0 ? prefix + branch : continuation) + row, width, "")
    );
  });
}

/** Continue the parent heading without creating a child branch. */
export function renderTreeContinuation(
  rows: readonly string[],
  options: TreeContinuationOptions
): string[] {
  const { width, indent = 0, style = (text) => text, hasChildren = false } = options;
  if (width < 1) return [];
  const prefix = style(" ".repeat(indent) + continuationPrefix(hasChildren));

  return rows.map((row) => truncateToWidth(prefix + row, width, ""));
}
