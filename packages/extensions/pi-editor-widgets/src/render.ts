import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  type Component
} from "@earendil-works/pi-tui";

export type Contribution = { component: Component };

/** `renderWidth` is the width passed to `render()`; `width` is the occupied mouse geometry. */
export type Cell = {
  component: Component;
  x: number;
  y: number;
  width: number;
  height: number;
  renderWidth: number;
};

export type Rendered = { lines: string[]; cells: Cell[] };

/** Last width each component rendered at. Duplicated placements share one live instance. */
export type RenderWidths = Map<Component, number>;

function draw(source: Contribution, width: number, widths: RenderWidths): string[] {
  const lines = source.component.render(width).map((line) => truncateToWidth(line, width));
  widths.set(source.component, width);

  return lines;
}

type Measured = {
  id: string;
  source: Contribution;
  lines: string[];
  natural: number;
  group: number;
  bullet: boolean;
};

const content = (line: string) => stripTerminalSequences(line).trim().length > 0;
const nonempty = (lines: string[]) => lines.some(content);

function measure(
  row: string[],
  sources: ReadonlyMap<string, Contribution>,
  width: number,
  widths: RenderWidths
): Measured[] {
  const nodes: Measured[] = [];
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
    const lines = draw(source, width, widths);
    if (!nonempty(lines)) continue;
    nodes.push({
      id,
      source,
      lines,
      natural: lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 1),
      group,
      bullet
    });
    bullet = false;
  }

  return nodes;
}

function gap(left: Measured | undefined, right: Measured): number {
  if (!left) return 0;

  return left.group === right.group && right.bullet ? 3 : 1;
}

function reflow(nodes: Measured[], width: number): Measured[][] {
  const rows: Measured[][] = [];
  let current: Measured[] = [];
  let used = 0;

  for (const node of nodes) {
    const minimum = Math.min(node.natural, 12, width);
    const spacing = gap(current.at(-1), node);

    if (current.length && used + spacing + minimum > width) {
      rows.push(current);
      current = [];
      used = 0;
    }

    used += gap(current.at(-1), node) + minimum;
    current.push(node);
  }

  if (current.length) rows.push(current);

  return rows;
}

/** Water-fill once from measured natural widths, without probing component renders in a loop. */
function allocate(nodes: Measured[], width: number): number[] {
  if (nodes.length === 1) return [width];
  let remaining = width - nodes.reduce((sum, node, index) => sum + gap(nodes[index - 1], node), 0);
  const sorted = nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => a.node.natural - b.node.natural);
  const widths: number[] = [];

  sorted.forEach(({ node, index }, order) => {
    const allocated = Math.max(
      1,
      Math.min(node.natural, Math.floor(remaining / (nodes.length - order)))
    );
    widths[index] = allocated;
    remaining -= allocated;
  });

  return widths;
}

type Box = { node: Measured; width: number; renderWidth: number; lines: string[] };

function renderBoxes(
  nodes: Measured[],
  width: number,
  single: boolean,
  widths: RenderWidths
): Box[] {
  const allocations = allocate(nodes, width);
  let group: number | undefined;
  let bullet = false;

  return nodes.flatMap((node, index) => {
    if (group !== node.group) bullet = false;
    group = node.group;
    bullet ||= node.bullet;
    const allocated = allocations[index] ?? width;
    const lines = allocated === width ? node.lines : draw(node.source, allocated, widths);
    // Only a logical singleton gets the full width. A reflowed single group can still align via flex.
    const used = single
      ? allocated
      : Math.min(
          allocated,
          lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0)
        );
    if (!nonempty(lines)) return [];
    const box = { node: { ...node, bullet }, width: used, renderWidth: allocated, lines };
    bullet = false;

    return [box];
  });
}

function compose(
  boxes: Box[],
  width: number,
  leadingFlex: boolean,
  hasFlex: boolean,
  separator: string
): Rendered {
  const height = Math.max(0, ...boxes.map((box) => box.lines.length));
  const needed = boxes.reduce(
    (sum, box, index) => sum + box.width + gap(boxes[index - 1]?.node, box.node),
    0
  );
  const spare = hasFlex ? Math.max(0, width - needed) : 0;
  const rightOnly = leadingFlex || boxes[0]?.node.group === 1;
  let x = rightOnly ? spare : 0;
  const cells: Cell[] = [];
  const positions = boxes.map((box, index) => {
    const previous = boxes[index - 1];
    const spacing = gap(previous?.node, box.node);
    if (previous && previous.node.group !== box.node.group) x += spare;
    x += spacing;
    const position = x;
    cells.push({
      component: box.node.source.component,
      x,
      y: 0,
      width: box.width,
      height: box.lines.length,
      renderWidth: box.renderWidth
    });
    x += box.width;

    return { box, position, spacing };
  });
  const lines = Array.from({ length: height }, (_, y) => {
    let line = "";

    positions.forEach(({ box, position, spacing }, index) => {
      const previous = positions[index - 1]?.box;
      const current = box.lines[y] ?? "";
      const bullet =
        previous &&
        previous.node.group === box.node.group &&
        box.node.bullet &&
        content(previous.lines[y] ?? "") &&
        content(current);
      const padding = Math.max(0, position - visibleWidth(line));
      line +=
        bullet && spacing === 3
          ? " ".repeat(Math.max(0, padding - 3)) + separator
          : " ".repeat(padding);
      // End each cell's style and hyperlink without trimming meaningful padding or blank lines.
      line += current + "\x1b[0m\x1b]8;;\x07";
    });

    return truncateToWidth(line, width);
  });

  return { lines, cells };
}

export function renderRows(
  rows: string[][],
  sources: ReadonlyMap<string, Contribution>,
  width: number,
  separator: string,
  widths: RenderWidths = new Map()
): Rendered {
  const result: Rendered = { lines: [], cells: [] };
  if (width < 1) return result;

  for (const row of rows) {
    const nodes = measure(row, sources, width, widths);

    for (const physical of reflow(nodes, width)) {
      const boxes = renderBoxes(
        physical,
        width,
        nodes.length === 1 && !row.includes("flex"),
        widths
      );
      const rendered = compose(boxes, width, row[0] === "flex", row.includes("flex"), separator);
      const offset = result.lines.length;
      result.cells.push(...rendered.cells.map((cell) => ({ ...cell, y: cell.y + offset })));
      result.lines.push(...rendered.lines);
    }
  }

  return result;
}

export function clip(rendered: Rendered, height: number, width: number): Rendered {
  if (rendered.lines.length <= height) return rendered;
  const visible = Math.max(0, height - 1);

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
