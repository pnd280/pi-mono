import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ReadToolDetails,
  ReadToolInput
} from "@earendil-works/pi-coding-agent";
import {
  selectionInputSchema,
  selectionSchema,
  selectSource,
  type SelectedSource,
  type Selection
} from "@pi-mono/utils/source-selection";
import { z } from "zod";

import { selectionPreview } from "./selection.ts";

const optionalCoordinate = z.preprocess(
  (value) => (value === null ? undefined : value),
  selectionInputSchema.shape.startColumn
);

/** Pi removes optional nulls before execution, but standalone display cards receive raw arguments. */
export const retainedSelectionSchema = selectionInputSchema
  .extend({
    startColumn: optionalCoordinate,
    endLine: optionalCoordinate,
    endColumn: optionalCoordinate
  })
  .pipe(selectionSchema);

const detailsSchema = z
  .object({
    selectiveRead: z.object({ sourceBlocks: z.int().positive() }).optional(),
    truncation: z.object({ outputLines: z.int().nonnegative() }).optional()
  })
  .optional();

export type SelectiveReadDetails = ReadToolDetails & {
  selectiveRead?: { sourceBlocks: number };
};

export type ReadResult = AgentToolResult<SelectiveReadDetails | undefined>;

/** Borrowed blocks and details are validated without replacing or mutating them. */
export interface ReadResultView {
  readonly content: readonly Readonly<TextContent | ImageContent>[];
  readonly details?: unknown;
}

export interface ReadWindow {
  offset?: number | undefined;
  limit?: number | undefined;
}

export interface ReadHighlight {
  /** Zero-based source line and UTF-16 offsets, before terminal sanitisation. */
  line: number;
  start: number;
  end: number;
}

export interface ReadDocument {
  lines: string[];
  notice: string;
  firstLine: number;
  select(selection: Selection): SelectedSource & { ranges: ReadHighlight[] };
}

export interface ReadTextWindow {
  /** Pass the native presentation's source part, with its diagnostic trailer separated. */
  highlight(text: string, selection: Selection): ReadHighlight[];
}

export interface ReadInterpretation {
  /** Display rejects invalid contracts; producer rendering can recover the retained source. */
  valid: boolean;
  preview: { kind: "absent" } | { kind: "invalid" } | { kind: "valid"; contentIndex: number };
  sourceContent: ReadResultView["content"];
  document: ReadDocument | undefined;
  /** Indexed by original content position, without flattening text or images. */
  blocks: readonly (ReadTextWindow | undefined)[];
}

function sourceLines(text: string): string[] {
  const all = text === "" ? [] : text.split("\n");
  if (text.endsWith("\n")) all.pop();

  return all;
}

function selectReadSource(lines: readonly string[], firstLine: number, selection: Selection) {
  const selected = selectSource(lines, firstLine, selection);

  return {
    ...selected,
    ranges: selected.lines.map((line) => ({
      line: line.index,
      start: line.before.length,
      end: line.before.length + line.text.length
    }))
  };
}

/** Pure interpretation shared by preview production and both renderers. See docs/result.md. */
export function interpretReadResult(
  result: ReadResultView,
  args: ReadWindow = {}
): ReadInterpretation {
  const parsed = detailsSchema.safeParse(result.details);
  const count = parsed.data?.selectiveRead?.sourceBlocks;
  const marked =
    typeof result.details === "object" &&
    result.details !== null &&
    "selectiveRead" in result.details &&
    result.details.selectiveRead !== undefined;
  let preview: ReadInterpretation["preview"] = { kind: "absent" };
  if (marked)
    preview =
      count !== undefined &&
      count === result.content.length - 1 &&
      result.content.every((block) => block.type === "text")
        ? { kind: "valid", contentIndex: count }
        : { kind: "invalid" };
  const sourceContent =
    preview.kind === "valid" ? result.content.slice(0, preview.contentIndex) : result.content;
  const start = Math.max(0, (args.offset ?? 1) - 1);
  const firstLine = Math.trunc(start) + 1;
  const end = args.limit === undefined ? Infinity : Math.trunc(start + args.limit);
  const relativeEnd = end < 0;
  const requested = relativeEnd ? Infinity : Math.max(0, end - Math.trunc(start));
  const allText = sourceContent.length > 0 && sourceContent.every((block) => block.type === "text");

  const sourceLimit = () => {
    if (parsed.data?.truncation) return parsed.data.truncation.outputLines;
    if (!relativeEnd) return requested;
    // Pi's negative slice end is relative to the file length. Without truncation,
    // that branch always appends a blank line and one continuation-notice line.
    const count = sourceContent.reduce(
      (sum, block) => sum + (block.type === "text" ? block.text.split("\n").length : 0),
      0
    );

    return Math.max(0, count - 2);
  };

  return {
    valid: parsed.success && preview.kind !== "invalid",
    preview,
    sourceContent,
    // Recognition and notices need no source splitting. Interpret only the requested view.
    get document(): ReadDocument | undefined {
      if (!allText) return undefined;
      // Same newline joins as Pi's contentText, including empty and newline-terminated blocks.
      const text = sourceContent.map((block) => block.text).join("\n");
      // Pi emits a text-only image note when decoding fails. Literal prefixes are ambiguous.
      if (text.startsWith("Read image file [image/")) return undefined;
      const all = sourceLines(text);
      const lines = all.slice(0, sourceLimit());

      return {
        lines,
        notice: all.slice(lines.length).join("\n").trim(),
        firstLine,
        select: (selection) => selectReadSource(lines, firstLine, selection)
      };
    },
    get blocks() {
      const returned = sourceLimit();
      let precedingLines = 0;

      return sourceContent.map((block): ReadTextWindow | undefined => {
        const blockFirstLine = firstLine + precedingLines;
        const remaining = Math.max(0, returned - precedingLines);
        // A block join contributes a newline even when its text already ends in one.
        if (block.type === "text") precedingLines += block.text.split("\n").length;
        if (!allText || block.type !== "text" || block.text.startsWith("Read image file [image/"))
          return undefined;

        return {
          highlight: (source, selection) =>
            selectReadSource(sourceLines(source).slice(0, remaining), blockFirstLine, selection)
              .ranges
        };
      });
    }
  };
}

export function appendPreview(
  result: ReadResult,
  args: ReadToolInput,
  selection: Selection
): ReadResult {
  const interpreted = interpretReadResult(result, args);
  const document = interpreted.document;
  if (!document || interpreted.preview.kind === "invalid") return result;
  const preview = selectionPreview(document.select(selection));

  return {
    ...result,
    content: [...interpreted.sourceContent, { type: "text", text: preview }],
    details: {
      ...result.details,
      selectiveRead: { sourceBlocks: interpreted.sourceContent.length }
    }
  };
}
