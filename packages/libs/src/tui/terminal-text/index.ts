import { stripTerminalSequences, wrapTextWithAnsi } from "@earendil-works/pi-tui";

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
    while (index < text.length && !/[\x40-\x7e]/.test(text.charAt(index))) index++;
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

export interface TerminalTextSlice {
  text: string;
  leadingSgr: string;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function isSimpleBoundary(text: string, position: number): boolean {
  if (position <= 0 || position >= text.length) return true;
  const previous = text.charCodeAt(position - 1);
  const next = text.charCodeAt(position);

  return previous < 0x80 && next < 0x80 && !(previous === 0x0d && next === 0x0a);
}

function graphemeBoundary(text: string, position: number, side: "start" | "end"): number {
  if (isSimpleBoundary(text, position)) return position;
  // Segment the original text: slicing first can change regional-indicator pairing.
  const segment = graphemes.segment(text).containing(position);
  if (!segment || segment.index === position) return position;

  return side === "start" ? segment.index + segment.segment.length : segment.index;
}

function canonicalSgr(codes: string): string {
  return codes ? (wrapTextWithAnsi(`${codes}\n`, 1).at(-1) ?? "") : "";
}

function advanceSgr(codes: string, sequence: string): string {
  if (sequence === "\x1b[m" || sequence === "\x1b[0m") return "";
  const advanced = codes + sequence;

  return advanced.length > 4096 ? canonicalSgr(advanced) : advanced;
}

/** Select a UTF-16 source range without splitting graphemes or recognized terminal sequences.
 * `leadingSgr` restores process styling when a styled suffix starts mid-stream.
 */
export function sliceTerminalText(
  text: string,
  requestedStart: number,
  requestedEnd: number,
  options: { preserveSgr?: boolean } = {}
): TerminalTextSlice {
  let start = Math.max(0, Math.min(text.length, Math.trunc(requestedStart)));
  let end = Math.max(start, Math.min(text.length, Math.trunc(requestedEnd)));
  if (start === 0 && end === text.length) return { text, leadingSgr: "" };
  let sgr = "";
  // Keep this parser aligned with styledOutput so hidden OSC/DCS payloads cannot affect SGR state.
  // oxlint-disable-next-line no-control-regex
  const escapes = /[\x1b\x9b\x9d\x90]/g;
  const scannedText = end < text.length ? text.slice(0, end) : text;
  let startIsSequenceBoundary = start === 0;
  let endIsSequenceBoundary = end === text.length;

  for (
    let match = escapes.exec(scannedText);
    match && match.index < end;
    match = escapes.exec(scannedText)
  ) {
    const sequence = escapeSequence(scannedText, match.index);
    const sequenceEnd = Math.min(text.length, sequence.end);

    if (match.index < start && sequenceEnd > start) {
      start = sequenceEnd;
      startIsSequenceBoundary = true;
    }

    if (match.index < end && sequenceEnd > end) {
      end = match.index;
      endIsSequenceBoundary = true;
    }

    if (options.preserveSgr && match.index < start && sequence.sgr)
      sgr = advanceSgr(sgr, sequence.sgr);

    escapes.lastIndex = Math.max(sequenceEnd, match.index + 1);
  }

  if (!startIsSequenceBoundary) start = graphemeBoundary(text, start, "start");
  if (!endIsSequenceBoundary) end = graphemeBoundary(text, end, "end");
  if (start >= end) return { text: "", leadingSgr: "" };

  return {
    text: text.slice(start, end),
    leadingSgr: options.preserveSgr ? canonicalSgr(sgr) : ""
  };
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

/** Flatten untrusted labels to one line before tab/CR expansion, then collapse spaces. */
export function compactDisplayText(text: string): string {
  return displayText(styledOutput(text.replace(/[\r\n\t]+/g, " "))).replace(/ +/g, " ");
}
