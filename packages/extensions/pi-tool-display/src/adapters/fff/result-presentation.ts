import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { FffToolKind } from "@pi-mono/utils/fff-tools";

import type { DisplayNotice, ResultTextContext, ResultTextPart } from "../types.ts";

const part = (text: string, kind: ResultTextPart["kind"] = "output"): ResultTextPart => ({
  text,
  kind
});

/** The FFF 0.10.6 text envelope carries diagnostics absent from its numeric details. */
export function fffResultParts(
  text: string,
  kind: FffToolKind,
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
    /(?:^|\n\n)(\[(?:Invalid regex:[\s\S]*?, used literal match(?:\. Continue with cursor="[^"\n]+")?|Query "[\s\S]*?" produced only weak scattered fuzzy matches\. Output capped at \d+\/\d+\.|(?:Continue with cursor=|\d+ more match(?:es)? available\.|More available\. cursor=|\d+\+ matches \(refine patterns\))[^\n]*)\])$/.exec(
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
  kind: FffToolKind
): DisplayNotice[] {
  return result.content.flatMap((block) =>
    block.type === "text"
      ? fffResultParts(block.text, kind, { isError: false, isPartial: false })
          .filter((part) => part.kind === "warning")
          .map((part) => ({ kind: "warning" as const, text: part.text }))
      : []
  );
}
