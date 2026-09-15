import { setImmediate } from "node:timers/promises";

import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { renderOverflowBorder, ScrollableTextPreview } from "./index.ts";

it("bounds the viewport and overflow counts through scrolling, reflow, and fitting all content", async () => {
  const preview = new ScrollableTextPreview({ changed() {}, current: () => true });
  preview.setText(Array.from({ length: 20 }, () => "界".repeat(20)).join("\n"));

  try {
    for (const [width, total] of [
      [40, 20],
      [20, 40]
    ] as const) {
      preview.setViewport({ height: 5, scroll: 0 });
      expect(preview.render(width)).toEqual([]);
      expect(preview.loading).toBe(true);
      expect(preview.overflow).toEqual({ above: 0, below: 0 });
      await vi.waitFor(() => expect(preview.render(width)).toHaveLength(5));
      expect(preview.overflow).toEqual({ above: 0, below: total - 5 });
      preview.setViewport({ height: 5, scroll: 7 });
      expect(preview.render(width)).toHaveLength(5);
      expect(preview.overflow).toEqual({ above: 7, below: total - 12 });
      preview.setViewport({ height: 5, scroll: 10000 });
      expect(preview.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
      expect(preview.scroll).toBe(total - 5);
      expect(preview.overflow.below).toBe(0);
      preview.setViewport({ height: 100, scroll: preview.scroll });
      expect(preview.render(width)).toHaveLength(total);
      expect(preview.scroll).toBe(0);
      expect(preview.overflow).toEqual({ above: 0, below: 0 });
    }

    preview.setViewport({ height: 0, scroll: 0 });
    expect(preview.render(20)).toEqual([]);
    expect(preview.render(0)).toEqual([]);
  } finally {
    preview.dispose();
  }
});

it("reuses width/text layout and suppresses stale text, width and disposed completions", async () => {
  const changed = vi.fn();
  const preview = new ScrollableTextPreview({ changed, current: () => true });
  preview.setViewport({ height: 2, scroll: 0 });
  preview.setText("old\n".repeat(100000));
  preview.render(40);
  preview.setText("current text");
  preview.render(10);
  preview.render(40);
  await vi.waitFor(() => expect(preview.render(40)).toEqual(["current text"]));
  expect(changed).toHaveBeenCalledTimes(1);
  preview.invalidate();
  preview.setText("current text");
  expect(preview.render(40)).toEqual(["current text"]);
  expect(preview.loading).toBe(false);
  preview.setText("pending\n".repeat(100000));
  preview.render(40);
  preview.dispose();
  await setImmediate();
  await setImmediate();
  expect(changed).toHaveBeenCalledTimes(1);
  expect(preview.render(40)).toEqual([]);
});

it("uses bounded overflow borders, retaining consumer headings when space permits", () => {
  const color = (text: string) => text;

  for (const width of [0, 1, 5, 40, 80]) {
    for (const direction of ["↑", "↓"] as const) {
      const border = renderOverflowBorder(width, {
        color,
        direction,
        hidden: 123,
        prefix: " title "
      });
      expect(visibleWidth(border)).toBeLessThanOrEqual(width);

      if (width >= 40) {
        expect(border).toContain("title");
        expect(border).toContain(`${direction} 123 more`);
      }
    }
  }

  expect(renderOverflowBorder(40, { color, direction: "↑", hidden: 0 })).not.toContain("more");
});
