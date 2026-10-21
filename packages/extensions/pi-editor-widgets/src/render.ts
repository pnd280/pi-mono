import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  type Component
} from "@earendil-works/pi-tui";

/** `renderWidth` is the width passed to `render()`; `width` is the occupied mouse geometry. */
type Cell = {
  component: Component;
  x: number;
  y: number;
  width: number;
  height: number;
  renderWidth: number;
  images: boolean;
};

export type Rendered = { lines: string[]; cells: Cell[] };

/** Vertical placement of shorter items within a multiline row. */
type Align = "top" | "bottom";

type Item = {
  component: Component;
  lines: string[];
  width: number;
  group: number;
  bullet: boolean;
  images: boolean;
};

const content = (line: string) => stripTerminalSequences(line).trim().length > 0;

/**
 * Whitespace can still paint through background, reverse, or underline styles. Treat any escape
 * other than resets and known non-painting SGR codes as visible output.
 */
const painted = (line: string) =>
  content(line) ||
  line
    // oxlint-disable-next-line no-control-regex -- Only resets and known non-painting SGR codes are neutral.
    .replace(/\x1b\[(?:0|1|2|3|22|23|3[0-7]|39|9[0-7]|38;5;\d+|38;2;\d+;\d+;\d+)?m/gu, "")
    .includes("\x1b");

/** Only compact literal trailing spaces known not to paint or carry terminal metadata. */
function compactWidth(line: string): number {
  if (!line.endsWith(" ")) return visibleWidth(line);
  // SGR resets do not close OSC links or other terminal metadata.
  // oxlint-disable-next-line no-control-regex -- Inspect ESC without changing terminal output.
  if (line.replace(/\x1b\[[\d;]*m/gu, "").includes("\x1b")) return visibleWidth(line);
  const trimmed = line.replace(/ +$/u, "");
  const reset = trimmed.lastIndexOf("\x1b[0m");
  const active = trimmed.slice(reset < 0 ? 0 : reset + 4);
  // Foreground, intensity and italics do not paint spaces. Keep unknown/decorated suffixes intact.
  const neutral = active.replace(
    // oxlint-disable-next-line no-control-regex -- Only known non-painting SGR codes are neutral.
    /\x1b\[(?:1|2|3|22|23|3[0-7]|39|9[0-7]|38;5;\d+|38;2;\d+;\d+;\d+)m/gu,
    ""
  );

  return visibleWidth(neutral.includes("\x1b") ? line : trimmed);
}

function measure(row: string[], sources: ReadonlyMap<string, Component>, width: number): Item[] {
  const items: Item[] = [];
  let group = 0;
  let bullet = false;

  for (const id of row) {
    if (id === "separator") {
      bullet = true;
      continue;
    }

    if (id === "flex") {
      group++;
      bullet = false;
      continue;
    }

    const source = sources.get(id);
    if (!source) continue;
    const output = source.render(width);
    // Native image payloads are opaque to text measurement and must own their full rows.
    const images = output.some(
      (line) => line.includes("\x1b_G") || line.includes("\x1b]1337;File=")
    );
    const lines = images ? output : output.map((line) => truncateToWidth(line, width));
    if (!images && !lines.some(painted)) continue;
    items.push({
      component: source,
      lines,
      width: images ? width : lines.reduce((max, line) => Math.max(max, compactWidth(line)), 1),
      group,
      bullet,
      images
    });
    bullet = false;
  }

  // Preserve full-width singleton padding; shared items retain only their occupied width.
  const singleton = items.length === 1 ? items[0] : undefined;
  if (singleton && !row.includes("flex")) singleton.width = width;

  return items;
}

function gap(left: Item | undefined, right: Item): number {
  if (!left) return 0;

  return left.group === right.group && right.bullet ? 3 : 1;
}

/** Wrap whole items in order, without shrinking or rerendering them to make room. */
function wrap(items: Item[], width: number): Item[][] {
  const rows: Item[][] = [];
  let current: Item[] = [];
  let used = 0;

  for (const item of items) {
    if (current.length && used + gap(current.at(-1), item) + item.width > width) {
      rows.push(current);
      current = [];
      used = 0;
    }

    used += gap(current.at(-1), item) + item.width;
    current.push(item);
  }

  if (current.length) rows.push(current);

  return rows;
}

function compose(
  items: Item[],
  width: number,
  hasFlex: boolean,
  separator: string,
  align: Align
): Rendered {
  const height = Math.max(0, ...items.map((item) => item.lines.length));
  const top = (item: Item) => (align === "bottom" ? height - item.lines.length : 0);
  const lineAt = (item: Item, y: number) => item.lines[y - top(item)] ?? "";
  const needed = items.reduce(
    (sum, item, index) => sum + item.width + gap(items[index - 1], item),
    0
  );
  const spare = hasFlex ? Math.max(0, width - needed) : 0;
  let x = items[0]?.group === 1 ? spare : 0;
  const cells: Cell[] = [];
  const positions = items.map((item, index) => {
    const previous = items[index - 1];
    const spacing = gap(previous, item);
    if (previous && previous.group !== item.group) x += spare;
    x += spacing;
    const position = x;
    cells.push({
      component: item.component,
      x,
      y: top(item),
      width: item.width,
      height: item.lines.length,
      renderWidth: width,
      images: item.images
    });
    x += item.width;

    return { item, position, spacing };
  });
  if (items[0]?.images) return { lines: items[0].lines, cells };
  const lines = Array.from({ length: height }, (_, y) => {
    let line = "";

    positions.forEach(({ item, position, spacing }, index) => {
      const previous = items[index - 1];
      const current = truncateToWidth(lineAt(item, y), item.width, "");
      const bullet =
        previous &&
        previous.group === item.group &&
        item.bullet &&
        content(lineAt(previous, y)) &&
        content(current);
      const padding = Math.max(0, position - visibleWidth(line));
      line +=
        bullet && spacing === 3
          ? " ".repeat(Math.max(0, padding - 3)) + separator
          : " ".repeat(padding);
      // End each cell's style and hyperlink; only known surplus padding was cropped above.
      line += current + "\x1b[0m\x1b]8;;\x07";
    });

    return truncateToWidth(line, width);
  });

  return { lines, cells };
}

export function renderRows(
  rows: string[][],
  sources: ReadonlyMap<string, Component>,
  width: number,
  separator: string,
  align: Align = "top"
): Rendered {
  const result: Rendered = { lines: [], cells: [] };
  if (width < 1) return result;

  for (const row of rows) {
    for (const items of wrap(measure(row, sources, width), width)) {
      const rendered = compose(items, width, row.includes("flex"), separator, align);
      const offset = result.lines.length;
      result.cells.push(...rendered.cells.map((cell) => ({ ...cell, y: cell.y + offset })));
      result.lines.push(...rendered.lines);
    }
  }

  return result;
}

export function clip(rendered: Rendered, height: number, width: number): Rendered {
  if (rendered.lines.length <= height) return rendered;
  let visible = Math.max(0, height - 1);
  // Without native image geometry, clipping a payload or its blank rows could paint over the editor.
  const splitImage = rendered.cells.find(
    (cell) => cell.images && cell.y < visible && cell.y + cell.height > visible
  );
  if (splitImage) visible = splitImage.y;

  return {
    lines:
      height > 0
        ? [...rendered.lines.slice(0, visible), truncateToWidth("… widgets clipped", width)]
        : [],
    cells: rendered.cells
      .filter((cell) => cell.y < visible)
      .map((cell) => ({ ...cell, height: Math.min(cell.height, visible - cell.y) }))
  };
}
