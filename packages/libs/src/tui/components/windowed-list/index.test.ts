import { getSettingsListTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import { renderWindowedList } from "./index.ts";

beforeAll(() => initTheme("dark", false));

const plain = (text: string) => text;
const theme = {
  selectedPrefix: plain,
  selectedText: (text: string) => `[${text}]`,
  description: plain,
  scrollInfo: plain,
  noMatch: plain
};
const items = Array.from({ length: 1000 }, (_, id) => ({
  value: String(id),
  label: `item ${id} 界`
}));

it("formats only a bounded window and keeps externally selected items visible", () => {
  const format = vi.fn((visible: readonly (typeof items)[number][]) => ({ items: [...visible] }));
  const result = renderWindowedList({
    items,
    selectedIndex: 500,
    maxRows: 5,
    width: 30,
    theme,
    format
  });
  expect(result).toMatchObject({ start: 498, count: 5 });
  expect(format).toHaveBeenCalledWith(items.slice(498, 503));
  expect(result.lines.join("\n")).toContain(
    `[${stripTerminalSequences(getSettingsListTheme().cursor)}item 500 界]`
  );
  expect(result.lines).toHaveLength(5);
  expect(result.lines.every((line) => visibleWidth(line) <= 30)).toBe(true);
  expect(items).toHaveLength(1000);
});

it("handles empty/zero viewports and clamps out-of-range selection without changing caller state", () => {
  const format = (visible: readonly (typeof items)[number][]) => ({ items: [...visible] });

  for (const selectedIndex of [-1, 1001]) {
    const result = renderWindowedList({
      items,
      selectedIndex,
      maxRows: 5,
      width: 30,
      theme,
      format
    });
    expect(result.start).toBe(selectedIndex < 0 ? 0 : 995);
  }

  expect(
    renderWindowedList({ items: [], selectedIndex: -1, maxRows: 5, width: 30, theme, format }).lines
  ).toEqual([]);
  expect(
    renderWindowedList({ items, selectedIndex: 0, maxRows: 0, width: 30, theme, format }).lines
  ).toEqual([]);

  for (const width of [0, 1, 2]) {
    const { lines } = renderWindowedList({
      items,
      selectedIndex: 0,
      maxRows: 2,
      width,
      theme: { ...theme, selectedText: plain },
      format
    });
    expect(lines).toHaveLength(width ? 2 : 0);
    expect(
      lines.every((line) => visibleWidth(line) <= width),
      `width ${width}`
    ).toBe(true);
  }

  expect(() =>
    renderWindowedList({
      items,
      selectedIndex: 0,
      maxRows: 1,
      width: 30,
      theme,
      format: () => ({ items: [] })
    })
  ).toThrow(RangeError);
});
