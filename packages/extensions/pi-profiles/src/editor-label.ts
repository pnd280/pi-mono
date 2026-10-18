import {
  sliceByColumn,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth
} from "@earendil-works/pi-tui";

const BORDER = "─";

/**
 * Draws ` label ─` at the right end of an editor's top border. The label covers only plain border
 * with one border character before it, so the border's own text, such as Pi's working status or
 * scroll indicator, stays.
 */
export function labelBorder(
  border: string,
  label: string,
  color: (text: string) => string
): string {
  const text = ` ${label} ${BORDER}`;
  const width = visibleWidth(border);
  const start = width - visibleWidth(text);
  if (start < 1) return border;

  const covered = stripTerminalSequences(sliceByColumn(border, start - 1, width - start + 1));
  if (covered !== BORDER.repeat(width - start + 1)) return border;

  // Truncation closes an inherited OSC 8 link before the label.
  return truncateToWidth(border, start, "") + color(text);
}
