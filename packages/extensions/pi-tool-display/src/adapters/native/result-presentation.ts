import { displayText } from "../../layout.ts";
import { record, stringField } from "../../presentation.ts";
import type { DisplayNotice, ResultTextContext, ResultTextPart } from "../types.ts";

const part = (text: string, kind: ResultTextPart["kind"] = "output"): ResultTextPart => ({
  text,
  kind
});

/** Native image captions describe the adjacent image block, including optional model notices. */
export function nativeImageCaption(text: string): { mimeType: string; tail: string } | undefined {
  const match = /^Read image file \[([^\n\]]+)\]/.exec(text);
  return match ? { mimeType: match[1]!, tail: text.slice(match[0].length) } : undefined;
}

/** Interpret only the pinned native result envelope, never arbitrary tool names or output lines. */
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

  // These are trailers added by the native factories, not matches anywhere in file/process text.
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
  if (name === "read" && context.hasImages) {
    const image = nativeImageCaption(text);
    if (image) {
      const note =
        "[Current model does not support images. The image will be omitted from this request.]";
      const tail = image.tail;
      return [
        part("Read image file [", "annotation"),
        part(image.mimeType, "value"),
        part("]", "annotation"),
        ...(tail.endsWith(note)
          ? [part(tail.slice(0, -note.length), "annotation"), part(note, "warning")]
          : [part(tail, "annotation")])
      ];
    }
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
