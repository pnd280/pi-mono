import {
  SelectList,
  truncateToWidth,
  type SelectItem,
  type SelectListLayoutOptions,
  type SelectListTheme
} from "@earendil-works/pi-tui";

export type WindowedListOptions<Item> = {
  items: readonly Item[];
  selectedIndex: number;
  maxRows: number;
  width: number;
  theme: SelectListTheme;
  /** Format only the visible window, allowing caller-owned columns and timestamps. */
  format(
    this: void,
    items: readonly Item[]
  ): { items: SelectItem[]; layout?: SelectListLayoutOptions };
};

/** Controlled presentation only: callers own selection, navigation, empty states, and counters. */
export function renderWindowedList<Item>(options: WindowedListOptions<Item>): {
  lines: string[];
  start: number;
  count: number;
} {
  const { items, selectedIndex, maxRows, width, theme, format } = options;
  const count = Math.min(items.length, maxRows);
  if (!count || width < 1) return { lines: [], start: 0, count: 0 };
  const selected = Math.max(0, Math.min(items.length - 1, selectedIndex));
  const start = Math.max(0, Math.min(selected - Math.floor(count / 2), items.length - count));
  const formatted = format(items.slice(start, start + count));
  const list = new SelectList(formatted.items, count, theme, formatted.layout);
  list.setSelectedIndex(selected - start);

  // Pi's selection prefix can exceed a one-column viewport.
  return {
    lines: list.render(width).map((line) => truncateToWidth(line, width, "")),
    start,
    count
  };
}
