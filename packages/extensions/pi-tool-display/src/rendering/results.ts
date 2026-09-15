import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";

import { tree } from "./format.ts";
import type { PreparedCard } from "./types.ts";

export function resultRows(p: PreparedCard): string[] {
  if (p.group && !p.expanded) return [];
  const { items, annotations } = p.body;

  return [
    ...renderTreeContinuation(annotations, {
      width: p.width,
      indent: 2,
      style: (text) => p.theme.fg("dim", text),
      hasChildren: p.hasBody
    }),
    ...tree(items, p)
  ];
}
