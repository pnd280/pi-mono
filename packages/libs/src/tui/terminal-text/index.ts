import { stripTerminalSequences } from "@earendil-works/pi-tui";

/** C0/C1 controls other than tab, LF, and CR. Checks source without rewriting it. */
export function hasUnsafeTerminalControls(text: string): boolean {
  // oxlint-disable-next-line no-control-regex
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text);
}

function escapeSequence(text: string, position: number): { end: number; sgr: string } {
  const code = text.charCodeAt(position);
  let index = position;
  let kind: string | undefined = "P";
  if (code === 27) kind = text[++index];
  else if (code === 0x9b) kind = "[";
  else if (code === 0x9d) kind = "]";
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

/** Allow SGR only. OSC/DCS/APC and cursor/screen controls never reach the terminal.
 * Pass complete snapshots, not independently sanitized stream chunks.
 */
export function styledOutput(text: string): string {
  const literal = (value: string) =>
    value
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      // oxlint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
  // Copy literal runs rather than building a character-by-character rope for
  // every live snapshot. Escape parsing still sees the complete source.
  // oxlint-disable-next-line no-control-regex
  const escapes = /[\x1b\x9b\x9d\x90]/g;
  let result = "",
    start = 0;

  for (let match = escapes.exec(text); match; match = escapes.exec(text)) {
    const sequence = escapeSequence(text, match.index);
    result += literal(text.slice(start, match.index)) + sequence.sgr;
    start = sequence.end;
    escapes.lastIndex = start;
  }

  return result + literal(text.slice(start));
}

/** Untrusted content is plain text. Apply trusted styling only after normalization. */
export function displayText(text: string): string {
  return (
    stripTerminalSequences(text)
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      // C0/C1 bytes outside recognized sequences must not control the terminal.
      // oxlint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
  );
}
