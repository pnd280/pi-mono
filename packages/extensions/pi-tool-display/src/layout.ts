import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi
} from "@earendil-works/pi-tui";

/** Tool content is text, not terminal instructions. Styling is applied after normalization. */
export function displayText(text: string): string {
  return (
    stripTerminalSequences(text)
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "   ")
      // C0/C1 bytes left outside recognized escape sequences must not control the terminal.
      // oxlint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
  );
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
  hint: string
): string[] {
  if (maximum < 1 || width < 1) return [];
  if (rows.length <= maximum) return [...rows];
  const retained = maximum - 1;
  const head = Math.ceil(retained / 2);
  const tail = Math.floor(retained / 2);
  const omitted = rows.length - retained;
  const notice = truncateToWidth(`… ${omitted} more rows (${hint})`, width, "…");
  return [...rows.slice(0, head), notice, ...(tail > 0 ? rows.slice(-tail) : [])];
}

export function prefixRows(
  rows: readonly string[],
  width: number,
  first = "  └ ",
  continuation = "    "
): string[] {
  return rows.map((row, index) =>
    truncateToWidth((index === 0 ? first : continuation) + row, width, "")
  );
}

export function bodyWidth(width: number): number {
  return Math.max(1, width - visibleWidth("  └ "));
}
