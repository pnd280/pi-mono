import type { FffToolKind } from "@pi-mono/utils/fff-tools";

import type {
  BorrowedToolResult,
  DisplayNotice,
  ResultTextContext,
  ResultTextPart
} from "../../../contracts.ts";

const part = (text: string, kind: ResultTextPart["kind"] = "output"): ResultTextPart => ({
  text,
  kind
});

type Warning = { text: string; separator: string };

type Envelope = { content: string; prefix?: Warning; trailer?: Warning };

/** Recognise the envelope without formatting source lines on the notices-only path. */
function envelope(text: string, kind: FffToolKind): Envelope {
  const wildcardSuffix =
    "' matches everything \u2014 grep needs a concrete substring or identifier. Example: `pattern: 'MyClass'` or `pattern: 'export function'`.";
  if (kind !== "find" && text.startsWith("Pattern '") && text.endsWith(wildcardSuffix))
    return { content: "", prefix: { text, separator: "" } };
  const fuzzy = "[0 exact matches. Maybe you meant this?]";
  let prefix: Warning | undefined;

  if (text.startsWith(`${fuzzy}\n`)) {
    prefix = { text: fuzzy, separator: "\n" };
    text = text.slice(fuzzy.length + 1);
  }

  const match =
    /(?:^|\n\n)(\[(?:Invalid regex:[\s\S]*?, used literal match(?:\. Continue with cursor="[^"\n]+")?|Query "[\s\S]*?" produced only weak scattered fuzzy matches\. Output capped at \d+\/\d+\.|(?:Continue with cursor=|\d+ more match(?:es)? available\.|More available\. cursor=|\d+\+ matches \(refine patterns\))[^\n]*)\])$/.exec(
      text
    );
  const trailer = match && match.index + match[0].length === text.length ? match : null;
  const content = trailer ? text.slice(0, trailer.index) : text;
  const notice = trailer?.[1];

  return {
    content,
    ...(prefix ? { prefix } : {}),
    ...(trailer && notice !== undefined
      ? { trailer: { text: notice, separator: trailer[0].slice(0, -notice.length) } }
      : {})
  };
}

/** The FFF 0.10.6 text envelope carries diagnostics absent from its numeric details. */
export function fffResultParts(
  text: string,
  kind: FffToolKind,
  context: Pick<ResultTextContext, "isError" | "isPartial">
): ResultTextPart[] {
  if (context.isPartial) return [part(text)];
  if (context.isError) return [part(text, "error")];
  const { content, prefix, trailer } = envelope(text, kind);
  const parts: ResultTextPart[] = [];

  if (prefix) {
    parts.push(part(prefix.text, "warning"));
    if (prefix.separator) parts.push(part(prefix.separator));
  }

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
    if (trailer.separator) parts.push(part(trailer.separator));
    parts.push(part(trailer.text, "warning"));
  }

  return parts;
}

export function fffTextNotices(result: BorrowedToolResult, kind: FffToolKind): DisplayNotice[] {
  return result.content.flatMap((block) => {
    if (block.type !== "text") return [];
    const { prefix, trailer } = envelope(block.text, kind);
    const notices: DisplayNotice[] = [];
    if (prefix) notices.push({ kind: "warning", text: prefix.text });
    if (trailer) notices.push({ kind: "warning", text: trailer.text });

    return notices;
  });
}
