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
  renders: Map<number, string[]>;
  group: number;
  bullet: boolean;
};

const content = (line: string) => stripTerminalSequences(line).trim().length > 0;
const nonempty = (lines: string[]) => lines.some(content);
const lineWidth = (lines: string[]) =>
  lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);

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

const occupiedWidth = (lines: string[]) =>
  lines.reduce((max, line) => Math.max(max, compactWidth(line)), 0);

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
      natural: Math.max(1, occupiedWidth(lines)),
      renders: new Map([[width, lines]]),
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

function reflow(nodes: Measured[], width: number, minimum = 12): Measured[][] {
  const rows: Measured[][] = [];
  let current: Measured[] = [];
  let used = 0;

  for (const node of nodes) {
    const size = Math.min(node.natural, minimum, width);
    const spacing = gap(current.at(-1), node);

    if (current.length && used + spacing + size > width) {
      rows.push(current);
      current = [];
      used = 0;
    }

    used += gap(current.at(-1), node) + size;
    current.push(node);
  }

  if (current.length) rows.push(current);

  return rows;
}

/** Water-fill from measured demands, without probing component renders in a loop. */
function allocate(
  nodes: Measured[],
  width: number,
  demands = nodes.map((node) => node.natural)
): number[] {
  if (nodes.length === 1) return [width];
  let remaining = width - nodes.reduce((sum, node, index) => sum + gap(nodes[index - 1], node), 0);
  const sorted = nodes
    .map((node, index) => ({ natural: demands[index] ?? node.natural, index }))
    .sort((a, b) => a.natural - b.natural);
  const widths: number[] = [];

  sorted.forEach(({ natural, index }, order) => {
    const allocated = Math.max(
      1,
      Math.min(natural, Math.floor(remaining / (nodes.length - order)))
    );
    widths[index] = allocated;
    remaining -= allocated;
  });

  return widths;
}

type Box = {
  node: Measured;
  width: number;
  allocated: number;
  renderWidth: number;
  lines: string[];
};

function renderBoxes(
  nodes: Measured[],
  width: number,
  single: boolean,
  widths: RenderWidths,
  allocations = allocate(nodes, width),
  recover = true
): Box[] {
  let group: number | undefined;
  let bullet = false;

  const boxes = nodes.flatMap((node, index) => {
    if (group !== node.group) bullet = false;
    group = node.group;
    bullet ||= node.bullet;
    const allocated = allocations[index] ?? width;
    // Crop surplus padding from the measured snapshot instead of shrinking Text's content area.
    let renderWidth =
      allocated >= node.natural && node.natural < lineWidth(node.lines) ? width : allocated;

    if (!recover) {
      // Donating unused space must not rewrap a responsive Text's retained content.
      const snapshot = [...node.renders]
        .reverse()
        .find(([previous, lines]) => previous >= allocated && occupiedWidth(lines) <= allocated);
      if (snapshot) renderWidth = snapshot[0];
    }

    const lines = node.renders.get(renderWidth) ?? draw(node.source, renderWidth, widths);
    node.renders.set(renderWidth, lines);
    // Only a logical singleton gets the full width. A reflowed single group can still align via flex.
    const used = single ? allocated : Math.min(allocated, occupiedWidth(lines));
    if (!nonempty(lines)) return [];
    const box = { node: { ...node, bullet }, width: used, allocated, renderWidth, lines };
    bullet = false;

    return [box];
  });

  if (!recover || single || !boxes.length) return boxes;
  const survivors = boxes.map((box) => box.node);
  // Do not cap wrapped content at a ragged line's width: it still needs room to unwrap.
  const demands = boxes.map((box) =>
    box.lines.length <= box.node.lines.length
      ? Math.min(box.node.natural, box.width)
      : box.node.natural
  );
  const recovered = allocate(survivors, width, demands);
  if (recovered.every((size, index) => size === boxes[index]?.allocated)) return boxes;

  // One recovery only; width-sensitive widgets may disappear again. Never resurrect a dropped node.
  return renderBoxes(survivors, width, single, widths, recovered, false);
}

function chooseRows(
  nodes: Measured[],
  width: number,
  single: boolean,
  widths: RenderWidths
): Box[][] {
  const packed = reflow(nodes, width).map((row) => renderBoxes(row, width, single, widths));
  const natural = reflow(
    packed.flat().map((box) => box.node),
    width,
    width
  );
  const height = (rows: { lines: string[] }[][]) =>
    rows.reduce((sum, row) => sum + Math.max(0, ...row.map((box) => box.lines.length)), 0);
  if (height(natural) >= height(packed)) return packed;

  // Full-width snapshots provide a shorter layout without another component render.
  // Cells retain that render width so mouse dispatch can restore the matching native geometry.
  return natural.map((row) =>
    row.map((node) => ({
      node,
      width: node.natural,
      allocated: node.natural,
      renderWidth: width,
      lines: node.lines
    }))
  );
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
      const current = truncateToWidth(box.lines[y] ?? "", box.width, "");
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
      // End each cell's style and hyperlink; only known surplus padding was cropped above.
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

    for (const boxes of chooseRows(
      nodes,
      width,
      nodes.length === 1 && !row.includes("flex"),
      widths
    )) {
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
