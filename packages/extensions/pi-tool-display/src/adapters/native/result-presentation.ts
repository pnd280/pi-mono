import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/utils/terminal-text";

import type { DisplayNotice, ResultTextContext, ResultTextPart } from "../../contracts.ts";
import { stringField } from "../../terminal-text.ts";
import { record } from "../../values.ts";

const part = (text: string, kind: ResultTextPart["kind"] = "output"): ResultTextPart => ({
  text,
  kind
});

/** Native image captions describe the adjacent image block, including optional model notices. */
export function nativeImageCaption(text: string): { mimeType: string; tail: string } | undefined {
  const match = /^Read image file \[([^\n\]]+)\]/.exec(text);

  return match ? { mimeType: match[1]!, tail: text.slice(match[0].length) } : undefined;
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

/** Read bodies collapse independently of their image/model limitations. */
export function nativeReadImageNotices(
  content: AgentToolResult<unknown>["content"]
): DisplayNotice[] {
  const hasImages = content.some((block) => block.type === "image");

  return content.flatMap((block) =>
    block.type === "text"
      ? nativeImageWarnings(block.text, hasImages).map((text) => ({
          kind: "warning" as const,
          text
        }))
      : []
  );
}

/** Interpret retained native envelopes; exact literal lookalikes share their styling. */
export function nativeResultParts(
  name: string,
  text: string,
  input: unknown,
  context: ResultTextContext
): ResultTextPart[] {
  if (context.isPartial) return [part(text)];
  const shell = name === "bash" || name === "powershell";
  const suffix: ResultTextPart[] = [];
  if (shell && context.isError) {
    const status =
      /(?:^|\n\n)(Command exited with code -?\d+|Command aborted|Command timed out after [\d.e+-]+ seconds)$/.exec(
        text
      );
    if (!status || status.index + status[0].length !== text.length) return [part(text, "error")];
    text = text.slice(0, status.index);
    suffix.push(
      part(status[0].slice(0, -status[1]!.length)),
      part(status[1]!, status[1] === "Command aborted" ? "warning" : "error")
    );
  } else if (context.isError) return [part(text, "error")];

  // Match native trailer positions, not arbitrary lines. Retained text alone cannot
  // prove provenance; operation outcomes come from structured observations elsewhere.
  const trailer = (
    shell
      ? /(?:^|\n\n)(\[Showing (?:lines \d+-\d+ of \d+(?: \([\d.]+[KMG]?B limit\))?|last [\d.]+[KMG]?B of line \d+ \(line is [\d.]+[KMG]?B\))\. Full output: [^\n]+\])$/
      : name === "read"
        ? /(?:^|\n\n)(\[(?:Showing lines \d+-\d+ of \d+(?: \([\d.]+[KMG]?B limit\))?\. Use offset=\d+ to continue\.|\d+ more lines in file\. Use offset=\d+ to continue\.|Line \d+ is [\d.]+[KMG]?B, exceeds [\d.]+[KMG]?B limit\. Use bash: [^\n]+)\])$/
        : ["grep", "find", "ls"].includes(name)
          ? /(?:^|\n\n)(\[(?:\d+ (?:matches|results|entries) limit reached\.|[\d.]+[KMG]?B limit reached|Some lines truncated to \d+ chars\.)[^\n]*\])$/
          : undefined
  )?.exec(text);

  if (trailer && trailer.index + trailer[0].length === text.length) {
    text = text.slice(0, trailer.index);
    suffix.unshift(part(trailer[0].slice(0, -trailer[1]!.length)), part(trailer[1]!, "warning"));
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

  const empty = shell
    ? "(no output)"
    : name === "ls"
      ? "(empty directory)"
      : name === "find"
        ? "No files found matching pattern"
        : name === "grep"
          ? "No matches found"
          : undefined;
  if (text === empty) return [part(text, "annotation")];
  const path = stringField(args.path);
  const confirmation =
    name === "write"
      ? "Successfully wrote to "
      : name === "edit" && Array.isArray(args.edits)
        ? `Successfully replaced ${args.edits.length} block(s) in `
        : undefined;
  if (confirmation && text === `${confirmation}${path}${name === "edit" ? "." : ""}`)
    return [
      part(confirmation, "annotation"),
      part(path, "value"),
      ...(name === "edit" ? [part(".", "annotation")] : [])
    ];

  return [part(text)];
}

/** Backend omissions remain visible even when the successful read body is collapsed. */
export function nativeResultNotices(details: unknown): DisplayNotice[] {
  const data = record(details);
  const truncation = record(data.truncation);
  const notices: DisplayNotice[] = [];
  const warning = (text: string) => notices.push({ kind: "warning", text });
  if (truncation.truncated === true)
    warning("Tool output truncated by pi; expand to inspect retained output.");

  if (typeof data.fullOutputPath === "string") {
    notices.push({
      kind: "reference",
      label: "Saved output",
      value: displayText(data.fullOutputPath)
    });
  }

  if (typeof data.matchLimitReached === "number") warning("Match limit reached.");
  if (typeof data.resultLimitReached === "number") warning("Result limit reached.");
  if (typeof data.entryLimitReached === "number") warning("Entry limit reached.");
  if (data.linesTruncated === true) warning("Long result lines truncated by pi.");

  return notices;
}
