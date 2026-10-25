import { stripTerminalSequences, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** C0/C1 controls other than tab, LF, and CR. Checks source without rewriting it. */
export function hasUnsafeTerminalControls(text: string): boolean {
  // oxlint-disable-next-line no-control-regex
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text);
}

const sgrCodes = new Set([
  0, 1, 2, 3, 4, 5, 7, 8, 9, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 49, 90, 91, 92, 93, 94, 95, 96, 97, 100, 101, 102, 103, 104, 105, 106,
  107
]);

/** Keep the SGR dialect reconstructed by Pi's wrap/slice tracker. */
function supportedSgr(parameters: string): string {
  if (parameters === "") return "\x1b[m";
  const parts = parameters.split(";");
  const retained: string[] = [];

  for (let index = 0; index < parts.length; index++) {
    const parameter = parts[index];
    // Colon subparameters form one unsupported parameter, never separate attributes.
    if (!parameter || parameter.includes(":")) continue;
    const code = Number(parameter);

    if (code === 38 || code === 48 || code === 58) {
      const mode = parts[index + 1];
      // An unknown colour mode has no supported payload boundary.
      if (mode !== "5" && mode !== "2") break;
      const count = mode === "5" ? 1 : 3;
      const channels = parts.slice(index + 2, index + 2 + count);
      index += count + 1;
      // Consume underline-colour and malformed colour groups as a whole so their
      // channels cannot become bold, dim, blink, or other independent attributes.
      if (
        code !== 58 &&
        channels.length === count &&
        channels.every((channel) => /^\d+$/.test(channel) && Number(channel) <= 255)
      )
        retained.push(String(code), mode, ...channels.map((channel) => String(Number(channel))));
      continue;
    }

    if (sgrCodes.has(code)) retained.push(String(code));
  }

  return retained.length ? `\x1b[${retained.join(";")}m` : "";
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
      sgr = supportedSgr(text.slice(start, index));
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

export type TerminalTextSlice = {
  text: string;
  leadingSgr: string;
};

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
 * `leadingSgr` reconstructs suffix styling with Pi's SGR tracker.
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

    if (match.index < start && sequenceEnd >= start) {
      start = sequenceEnd;
      startIsSequenceBoundary = true;
    }

    if (match.index < end && sequenceEnd >= end) {
      if (sequenceEnd > end) end = match.index;
      // A following combining mark must not pull the boundary into a complete escape.
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

/** Normalise line endings and tabs; C0/C1 bytes outside recognised sequences must not control the terminal. */
function literal(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      // oxlint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
  );
}

/** Allow only SGR supported by Pi's style tracker. OSC/DCS/APC and cursor/screen controls never reach the terminal.
 * Pass complete snapshots, not independently sanitized stream chunks.
 */
export function styledOutput(text: string): string {
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
  // Consume every complete CSI command before the host's limited final-byte matcher.
  // oxlint-disable-next-line no-control-regex
  const withoutCsi = text.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "");

  return literal(stripTerminalSequences(withoutCsi));
}

/** Flatten untrusted labels to one line before tab/CR expansion, then collapse spaces. */
export function compactDisplayText(text: string): string {
  return displayText(styledOutput(text.replace(/[\r\n\t]+/g, " "))).replace(/ +/g, " ");
}
