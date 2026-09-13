import { stripTerminalSequences, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Tool content is text, not terminal instructions. Styling is applied after normalization. */
export function displayText(text: string): string {
  return (
    stripTerminalSequences(text)
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      // C0/C1 bytes left outside recognized escape sequences must not control the terminal.
      // oxlint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
  );
}

function escapeSequence(text: string, position: number): { end: number; sgr: string } {
  const code = text.charCodeAt(position);
  let index = position;
  const kind = code === 27 ? text[++index] : code === 0x9b ? "[" : code === 0x9d ? "]" : "P";
  index++;
  let sgr = "";
  if (kind === "[") {
    const start = index;
    while (index < text.length && !/[\x40-\x7e]/.test(text[index]!)) index++;
    if (text[index] === "m" && /^[0-9;:]*$/.test(text.slice(start, index)))
      sgr = `\x1b[${text.slice(start, index)}m`;
    index++;
  } else if (["]", "P", "_", "^", "X"].includes(kind ?? "")) {
    while (
      index < text.length &&
      text[index] !== "\x07" &&
      text[index] !== "\x9c" &&
      !(text[index] === "\x1b" && text[index + 1] === "\\")
    )
      index++;
    index += text[index] === "\x1b" ? 2 : 1;
  }
  return { end: index, sgr };
}

/** Allow SGR only. OSC/DCS/APC and cursor/screen controls never reach the terminal. */
export function styledOutput(text: string): string {
  let result = "";
  for (let index = 0; index < text.length;) {
    const code = text.charCodeAt(index);
    if (code === 27 || code === 0x9b || code === 0x9d || code === 0x90) {
      const sequence = escapeSequence(text, index);
      result += sequence.sgr;
      index = sequence.end;
      continue;
    }
    const character = text[index++]!;
    if (character === "\r") {
      if (text[index] === "\n") index++;
      result += "\n";
    } else if (character === "\t") result += "    ";
    else if (character === "\n" || (code >= 32 && !(code >= 127 && code <= 159)))
      result += character;
  }
  return result;
}

export function wrapRows(text: string, width: number): string[] {
  if (width < 1 || text === "") return [];
  // A wide grapheme cannot fit in a one-column viewport. The final clamp also covers
  // widths smaller than a gutter without emitting an over-width line to pi.
  return wrapTextWithAnsi(text, width).map((row) => truncateToWidth(row, width, ""));
}

/** Budget displayed rows, including the omission hint; retain both initial and final diagnostics. */
export function compactRows(
  rows: readonly string[],
  maximum: number,
  width: number,
  hint: string,
  styleNotice: (text: string) => string = (text) => text
): string[] {
  if (maximum < 1 || width < 1) return [];
  if (rows.length <= maximum) return [...rows];
  const retained = maximum - 1;
  const head = Math.ceil(retained / 2);
  const tail = Math.floor(retained / 2);
  const omitted = rows.length - retained;
  const notice = truncateToWidth(styleNotice(`… ${omitted} more rows (${hint})`), width, "…");
  return [...rows.slice(0, head), notice, ...(tail > 0 ? rows.slice(-tail) : [])];
}

/** A meaningful item with already measured content.
 * Related notices, metadata, and wrapped lines stay in rows, not separate items.
 */
export interface TreeItem {
  rows: string[];
}
type StructureStyle = (text: string) => string;

function continuationPrefix(hasFollowingSibling: boolean): string {
  return hasFollowingSibling ? "│ " : "  ";
}

/** Assign connectors only after visible siblings are known. followingSibling joins
 * fragments hosted by separate Pi rows without moving their content or images.
 */
export function renderTree(
  items: readonly TreeItem[],
  width: number,
  style: StructureStyle = (text) => text,
  followingSibling = false
): string[] {
  if (width < 1) return [];
  const visible = items.filter((item) => item.rows.length > 0);
  return visible.flatMap((item, index) => {
    const more = index < visible.length - 1 || followingSibling;
    const continuation = "  " + continuationPrefix(more);
    return item.rows.map((row, offset) =>
      truncateToWidth(
        style(offset === 0 ? (more ? "  ├ " : "  └ ") : continuation) + row,
        width,
        ""
      )
    );
  });
}

/** Continuations of the card heading, including parameters. No branch is invented
 * for these lines; the rail exists only when a visible result follows.
 */
export function renderTreeContinuation(
  rows: readonly string[],
  width: number,
  style: StructureStyle = (text) => text,
  hasChildren = false
): string[] {
  if (width < 1) return [];
  const prefix = style("  " + continuationPrefix(hasChildren));
  return rows.map((row) => truncateToWidth(prefix + row, width, ""));
}

export function bodyWidth(width: number): number {
  return Math.max(1, width - 4);
}
