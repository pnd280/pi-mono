import { tree } from "./format.ts";
import { renderTreeContinuation } from "./layout.ts";
import type { PreparedCard } from "./types.ts";

export function resultRows(p: PreparedCard): string[] {
  if (p.group && !p.expanded) return [];
  const { items, annotations } = p.body;

  return [
    ...renderTreeContinuation(annotations, p.width, (text) => p.theme.fg("dim", text), p.hasBody),
    ...tree(items, p)
  ];
}
