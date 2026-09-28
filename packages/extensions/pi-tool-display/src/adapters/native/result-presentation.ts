import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import type {
  BorrowedToolResult,
  DisplayNotice,
  ResultTextContext,
  ResultTextPart
} from "../../contracts.ts";
import { stringField } from "../../terminal-text.ts";
import { record } from "../../values.ts";

const part = (text: string, kind: ResultTextPart["kind"] = "output"): ResultTextPart => ({
  text,
  kind
});

/** Native image captions describe the adjacent image block, including optional model notices. */
export function nativeImageCaption(text: string): { mimeType: string; tail: string } | undefined {
  const match = /^Read image file \[([^\n\]]+)\]/.exec(text);
  const mimeType = match?.[1];

  return match && mimeType !== undefined
    ? { mimeType, tail: text.slice(match[0].length) }
    : undefined;
}

const nonVisionImageNote =
  "[Current model does not support images. The image will be omitted from this request.]";
const imageOmissionNotes = new Set([
  "[Image omitted: could not be converted to a supported inline image format.]",
  "[Image omitted: could not be resized below the inline image size limit.]"
]);

function nativeImageWarnings(text: string, hasImages: boolean): string[] {
  const caption = nativeImageCaption(text);
  if (!caption?.tail.startsWith("\n")) return [];
  const notes = caption.tail.slice(1).split("\n");
  // An omitted image has no attachment. Require its exact native omission envelope;
  // a model-warning lookalike in ordinary text alone does not establish an image read.
  if (
    !hasImages &&
    (!imageOmissionNotes.has(notes[0] ?? "") ||
      notes.length > 2 ||
      (notes.length === 2 && notes[1] !== nonVisionImageNote))
  )
    return [];

  return notes.filter((note) => note === nonVisionImageNote || imageOmissionNotes.has(note));
}

/** Compact reads retain diagnostics from the same native envelopes as expanded text. */
export function nativeReadNotices(result: BorrowedToolResult): DisplayNotice[] {
  const hasImages = result.content.some((block) => block.type === "image");

  return result.content.flatMap((block, contentIndex) =>
    block.type === "text"
      ? nativeResultParts(
          "read",
          block.text,
          {},
          {
            result,
            contentIndex,
            expanded: false,
            isError: false,
            isPartial: false,
            isCancelled: false,
            hasImages
          }
        )
          .filter((part) => part.kind === "warning")
          .map((part) => ({ kind: "warning" as const, text: part.text }))
      : []
  );
}

function splitTrailer(text: string, pattern: RegExp | undefined) {
  const match = pattern?.exec(text);
  const notice = match?.[1];
  if (!match || notice === undefined || match.index + match[0].length !== text.length)
    return undefined;

  return {
    content: text.slice(0, match.index),
    separator: match[0].slice(0, -notice.length),
    notice
  };
}

/** Interpret retained native envelopes; exact literal lookalikes share their styling. */
export function nativeResultParts(
  name: string,
  text: string,
  input: unknown,
  context: ResultTextContext
): ResultTextPart[] {
  if (context.isPartial) return [part(text)];
  const compactCancellation = context.isCancelled && !context.expanded;
  if (
    compactCancellation &&
    ["Operation aborted", "Tool execution was cancelled before completion."].includes(text)
  )
    return [];
  const shell = name === "bash" || name === "powershell";
  const suffix: ResultTextPart[] = [];
  if (shell && context.isError) {
    const status = splitTrailer(
      text,
      /(?:^|\n\n)(Command exited with code -?\d+|Command aborted|Command timed out after [\d.e+-]+ seconds)$/
    );
    if (!status) return [part(text, "error")];
    text = status.content;
    if (!compactCancellation || status.notice !== "Command aborted")
      suffix.push(part(status.separator), part(status.notice, "error"));
    else if (["", "(no output)"].includes(text)) return [];
  } else if (context.isError) return [part(text, "error")];

  // Match native trailer positions, not arbitrary lines. Retained text alone cannot
  // prove provenance; operation outcomes come from structured observations elsewhere.
  let trailerPattern: RegExp | undefined;
  if (shell)
    trailerPattern =
      /(?:^|\n\n)(\[Showing (?:lines \d+-\d+ of \d+(?: \([\d.]+[KMG]?B limit\))?|last [\d.]+[KMG]?B of line \d+ \(line is [\d.]+[KMG]?B\))\. Full output: [^\n]+\])$/;
  else if (name === "read")
    trailerPattern =
      /(?:^|\n\n)(\[(?:Showing lines \d+-\d+ of \d+(?: \([\d.]+[KMG]?B limit\))?\. Use offset=\d+ to continue\.|\d+ more lines in file\. Use offset=\d+ to continue\.|Line \d+ is [\d.]+[KMG]?B, exceeds [\d.]+[KMG]?B limit\. Use bash: [^\n]+)\])$/;
  else if (["grep", "find", "ls"].includes(name))
    trailerPattern =
      /(?:^|\n\n)(\[(?:\d+ (?:matches|results|entries) limit reached\.|[\d.]+[KMG]?B limit reached|Some lines truncated to \d+ chars\.)[^\n]*\])$/;
  const trailer = splitTrailer(text, trailerPattern);

  if (trailer) {
    text = trailer.content;
    suffix.unshift(part(trailer.separator), part(trailer.notice, "warning"));
  }

  return [...nativeContentParts(name, text, record(input), context), ...suffix];
}

function nativeContentParts(
  name: string,
  text: string,
  args: Record<string, unknown>,
  context: ResultTextContext
): ResultTextPart[] {
  const shell = name === "bash" || name === "powershell";

  if (name === "read") {
    const image = nativeImageCaption(text);
    const warnings = nativeImageWarnings(text, context.hasImages === true);
    if (image && (context.hasImages || warnings.length))
      return [
        part("Read image file [", "annotation"),
        part(image.mimeType, "value"),
        part("]", "annotation"),
        ...image.tail
          .split(/(\n)/)
          .map((text) => part(text, warnings.includes(text) ? "warning" : "annotation"))
      ];
  }

  let empty: string | undefined;
  if (shell) empty = "(no output)";
  else if (name === "ls") empty = "(empty directory)";
  else if (name === "find") empty = "No files found matching pattern";
  else if (name === "grep") empty = "No matches found";
  if (text === empty) return [part(text, "annotation")];
  const path = stringField(args.path);
  let confirmation: string | undefined;
  if (name === "write") confirmation = "Successfully wrote to ";
  else if (name === "edit" && Array.isArray(args.edits))
    confirmation = `Successfully replaced ${args.edits.length} block(s) in `;
  if (confirmation && text === `${confirmation}${path}${name === "edit" ? "." : ""}`)
    return [
      part(confirmation, "annotation"),
      part(path, "value"),
      ...(name === "edit" ? [part(".", "annotation")] : [])
    ];

  return [part(text)];
}

const noticesSchema = z.object({
  truncation: z
    .object({ truncated: z.boolean().optional().catch(undefined) })
    .optional()
    .catch(undefined),
  fullOutputPath: z.string().optional().catch(undefined),
  matchLimitReached: z.number().optional().catch(undefined),
  resultLimitReached: z.number().optional().catch(undefined),
  entryLimitReached: z.number().optional().catch(undefined),
  linesTruncated: z.boolean().optional().catch(undefined)
});

/** Backend omissions remain visible even when the successful read body is collapsed. */
export function nativeResultNotices(details: unknown): DisplayNotice[] {
  const data = noticesSchema.safeParse(details).data;
  if (!data) return [];
  const notices: DisplayNotice[] = [];
  const warning = (text: string) => notices.push({ kind: "warning", text });
  if (data.truncation?.truncated)
    warning("Tool output truncated by pi; expand to inspect retained output.");

  if (data.fullOutputPath !== undefined) {
    notices.push({
      kind: "reference",
      label: "Saved output",
      value: displayText(data.fullOutputPath)
    });
  }

  if (data.matchLimitReached !== undefined) warning("Match limit reached.");
  if (data.resultLimitReached !== undefined) warning("Result limit reached.");
  if (data.entryLimitReached !== undefined) warning("Entry limit reached.");
  if (data.linesTruncated === true) warning("Long result lines truncated by pi.");

  return notices;
}
