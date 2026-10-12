import { visibleWidth } from "@earendil-works/pi-tui";
import { textPrefix } from "@pi-mono/libs/tui/text-budget";

import type { InvocationPart } from "../contracts.ts";
import { invocationPartText } from "../invocation.ts";
import type { DisplayTheme } from "./types.ts";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const MAX_TARGET_CHARACTERS = 16 * 1024;

/** File targets are identifiers, not output previews. Keep their tail and range even
 * when a pathological argument exceeds the formatting budget. Never apply this to filters.
 */
function boundedTarget(text: string, maximum: number): string {
  if (text.length <= maximum) return text;
  const half = Math.floor(maximum / 2);
  const tail = graphemes.segment(text).containing(text.length - half);
  const tailStart = tail ? tail.index + tail.segment.length : text.length;

  return `${textPrefix(text, half)}…${text.slice(tailStart)}`;
}

type TargetOptions = { width: number; theme: Pick<DisplayTheme, "fg">; expanded: boolean };

/**
 * Returns target-only rows for a path, an optional range, and trailing annotations.
 * Callers own action labels, tree gutters and hanging indent.
 */
export function targetRows(
  parts: readonly InvocationPart[],
  options: TargetOptions & { cwd: string; relativeTo?: string }
): string[] | undefined {
  const [target, ...rest] = parts;
  if (target?.kind !== "path") return undefined;
  const { cwd } = options;
  let range = "";
  let annotation = "";

  for (const [index, part] of rest.entries()) {
    if (part.kind === "range" && index === 0) range = invocationPartText(part, cwd);
    else if (part.kind === "annotation") annotation += invocationPartText(part, cwd);
    else return undefined;
  }

  return pathRows(invocationPartText(target, cwd, options.relativeTo), options, range, annotation);
}

/**
 * Rows for a path already in display spelling. A `dim` range stays beside the basename;
 * `dim` annotations follow it, on the same row when they fit.
 */
export function pathRows(
  target: string,
  options: TargetOptions,
  range = "",
  annotation = ""
): string[] | undefined {
  const { width, theme } = options;
  if (width < 4) return undefined;
  const maximum = options.expanded ? Infinity : MAX_TARGET_CHARACTERS;
  const suffix = boundedTarget(range, maximum / 4);
  let note = boundedTarget(annotation, maximum / 4);
  const path = boundedTarget(target, maximum - suffix.length - note.length);
  const separator = path.lastIndexOf("/") + 1;
  const directory = path.slice(0, separator);
  const basename = path.slice(separator);
  const rows: string[] = [];
  let row = "";
  let used = 0;

  const flush = () => {
    if (row) rows.push(row);
    row = "";
    used = 0;
  };

  const appendLine = (text: string, color: "dim" | "text") => {
    if (!text) return;
    const size = visibleWidth(text);

    if (size <= width) {
      if (used && used + size > width) flush();
      row += theme.fg(color, text);
      used += size;

      return;
    }

    // A single path component can exceed a row. Prefer filename separators before
    // grapheme wrapping, preserving spaces and every character rather than trimming.
    for (const chunk of text.match(/[^\s_-]*[\s_-]|[^\s_-]+$/gu) ?? []) {
      const size = visibleWidth(chunk);

      if (size <= width) {
        if (used + size > width) flush();
        row += theme.fg(color, chunk);
        used += size;
      } else {
        for (const { segment } of graphemes.segment(chunk)) {
          const size = visibleWidth(segment);
          if (used + size > width) flush();
          if (size > width) continue;
          row += theme.fg(color, segment);
          used += size;
        }
      }
    }
  };

  const append = (text: string, color: "dim" | "text") => {
    for (const [index, line] of text.split("\n").entries()) {
      if (index > 0) {
        // Paths can contain literal line breaks. Keep blank lines, but never put
        // a newline inside a TUI row where it would bypass the caller's gutters.
        rows.push(row);
        row = "";
        used = 0;
      }

      appendLine(line, color);
    }
  };

  const appendWithRange = (text: string) => {
    if (used + visibleWidth(text + suffix) > width) flush();
    append(text, "text");
    append(suffix, "dim");
  };

  for (const component of directory.match(/[^/]*\//gu) ?? []) append(component, "text");
  // Prefer the complete basename plus range, or at least its final filename
  // segment plus range. Only a suffix wider than the target column may split.
  const tailStart =
    Math.max(basename.lastIndexOf("-"), basename.lastIndexOf("_"), basename.lastIndexOf(" ")) + 1;

  const together = visibleWidth(basename + suffix + note);

  if (note && together <= width) {
    if (used + together > width) flush();
    append(basename, "text");
    append(suffix + note, "dim");
    note = "";
  } else if (visibleWidth(basename + suffix) <= width) appendWithRange(basename);
  else if (visibleWidth(basename.slice(tailStart) + suffix) <= width) {
    append(basename.slice(0, tailStart), "text");
    appendWithRange(basename.slice(tailStart));
  } else {
    append(basename, "text");
    append(suffix, "dim");
  }

  if (note && used + visibleWidth(note) > width) {
    flush();
    // A wrapped annotation starts its row without its leading separator space.
    note = note.trimStart();
  }

  append(note, "dim");
  flush();

  return rows;
}
