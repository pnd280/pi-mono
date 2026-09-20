import { contentText } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ReadToolDetails,
  ReadToolInput
} from "@earendil-works/pi-coding-agent";
import { selectSource, type Selection } from "@pi-mono/utils/source-selection";
import { z } from "zod";

import { selectionPreview } from "./selection.ts";

const detailsSchema = z.object({
  selectiveRead: z.object({ sourceBlocks: z.int().positive() }).optional(),
  truncation: z.object({ outputLines: z.int().nonnegative() }).optional()
});

export type SelectiveReadDetails = ReadToolDetails & {
  selectiveRead?: { sourceBlocks: number };
};

export type ReadResult = AgentToolResult<SelectiveReadDetails | undefined>;

export interface ReadDocument {
  lines: string[];
  notice: string;
  firstLine: number;
}

/** Strip only the preview recorded by this extension, never text matched by a heading. */
export function sourceResult(result: ReadResult): ReadResult {
  const count = detailsSchema.safeParse(result.details).data?.selectiveRead?.sourceBlocks;
  if (count === undefined || count >= result.content.length) return result;

  return { ...result, content: result.content.slice(0, count) };
}

export function readDocument(
  result: ReadResult,
  args: Pick<ReadToolInput, "offset" | "limit">
): ReadDocument | undefined {
  if (result.content.length === 0 || result.content.some((block) => block.type !== "text"))
    return undefined;
  const text = contentText(result.content);
  // Pi emits a text-only image note when image decoding fails.
  if (text.startsWith("Read image file [image/")) return undefined;
  const all = text === "" ? [] : text.split("\n");
  if (text.endsWith("\n")) all.pop();
  const start = Math.max(0, (args.offset ?? 1) - 1);
  const firstLine = Math.trunc(start) + 1;
  const truncation = detailsSchema.safeParse(result.details).data?.truncation;
  // Native reads append continuation notices outside the returned source line count.
  const requested =
    args.limit === undefined
      ? all.length
      : Math.max(0, Math.trunc(start + args.limit) - Math.trunc(start));
  const count = Math.min(all.length, truncation?.outputLines ?? requested);

  return { lines: all.slice(0, count), notice: all.slice(count).join("\n").trim(), firstLine };
}

export function appendPreview(
  result: ReadResult,
  args: ReadToolInput,
  selection: Selection
): ReadResult {
  const document = readDocument(result, args);
  if (!document) return result;
  const preview = selectionPreview(selectSource(document.lines, document.firstLine, selection));

  return {
    ...result,
    content: [...result.content, { type: "text", text: preview }],
    details: { ...result.details, selectiveRead: { sourceBlocks: result.content.length } }
  };
}
