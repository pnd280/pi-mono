import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import { record, stringField } from "./presentation.ts";

export interface ResultTextPart {
  kind: "output" | "value" | "annotation" | "warning" | "error";
  text: string;
}
export type DisplayNotice =
  | { kind: "info" | "unavailable" | "warning" | "error"; text: string }
  | { kind: "reference"; label: string; value: string };
export interface ResultTextContext {
  isError: boolean;
  isPartial: boolean;
  hasImages?: boolean;
}
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

/** The FFF 0.10.6 text envelope carries diagnostics absent from its numeric details. */
export function fffResultParts(
  text: string,
  kind: "find" | "grep" | "multi",
  context: ResultTextContext
): ResultTextPart[] {
  if (context.isPartial) return [part(text)];
  if (context.isError) return [part(text, "error")];
  const wildcardSuffix =
    "' matches everything \u2014 grep needs a concrete substring or identifier. Example: `pattern: 'MyClass'` or `pattern: 'export function'`.";
  if (kind !== "find" && text.startsWith("Pattern '") && text.endsWith(wildcardSuffix))
    return [part(text, "warning")];
  const parts: ResultTextPart[] = [];
  const fuzzy = "[0 exact matches. Maybe you meant this?]";
  if (text.startsWith(`${fuzzy}\n`)) {
    parts.push(part(fuzzy, "warning"), part("\n"));
    text = text.slice(fuzzy.length + 1);
  }
  const match =
    /(?:^|\n\n)(\[(?:Invalid regex:[\s\S]*?, used literal match(?:\. Continue with cursor="[^"\n]+")?|(?:Continue with cursor=|Query |\d+ more match(?:es)? available\.|More available\. cursor=|\d+\+ matches \(refine patterns\))[^\n]*)\])$/.exec(
      text
    );
  const trailer = match && match.index + match[0].length === text.length ? match : null;
  const content = trailer ? text.slice(0, trailer.index) : text;
  if (content === (kind === "find" ? "No files found matching pattern" : "No matches found")) {
    parts.push(part(content, "annotation"));
  } else if (content) {
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (index) parts.push(part("\n"));
      const number = kind !== "find" ? /^( \d+[:-] )/.exec(line) : null;
      const annotation = !line.startsWith(" ")
        ? /  \[(?:[a-z_]+ in git|(?:VERY )?often touched file)\]$/.exec(line)
        : null;
      if (number) parts.push(part(number[0], "annotation"), part(line.slice(number[0].length)));
      else if (annotation)
        parts.push(part(line.slice(0, annotation.index)), part(annotation[0], "annotation"));
      else parts.push(part(line));
    });
  }
  if (trailer) {
    const notice = trailer[1]!;
    // Pagination guides the agent's next call, not the user's attention. A combined
    // trailer can still contain a regex fallback diagnostic that must remain visible.
    const pagination =
      /(?:^\[|\. )(?:Continue with cursor="[^"\n]+"|\d+ more match(?:es)? available\. cursor="[^"\n]+" to continue|More available\. cursor="[^"\n]+" to continue|\d+\+ matches \(refine patterns\)(?:\. More available\. cursor="[^"\n]+" to continue)?)\]$/.exec(
        notice
      );
    const diagnostic = pagination
      ? pagination.index === 0
        ? ""
        : `${notice.slice(0, pagination.index)}]`
      : notice;
    if (diagnostic)
      parts.push(part(trailer[0].slice(0, -notice.length)), part(diagnostic, "warning"));
  }
  return parts;
}

export function fffTextNotices(
  result: AgentToolResult<unknown>,
  kind: "find" | "grep" | "multi"
): DisplayNotice[] {
  return result.content.flatMap((block) =>
    block.type === "text"
      ? fffResultParts(block.text, kind, { isError: false, isPartial: false })
          .filter((part) => part.kind === "warning")
          .map((part) => ({ kind: "warning" as const, text: part.text }))
      : []
  );
}
