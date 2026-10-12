import type { CodeSelectionRange } from "@pi-mono/libs/tui/components/code-highlight";

import type {
  BorrowedToolResult,
  DisplayNotice,
  ExplorationItem,
  InvocationPart,
  ResultTextContext,
  ResultTextPart,
  SummaryItem,
  ToolDisplayAdapter
} from "../../contracts.ts";
import { pathSummaryItem } from "../../summary/items.ts";
import { nativeFilePath, nativeInvocationParts } from "./invocation.ts";
import {
  nativeImageCaption,
  nativeResultNotices,
  nativeResultParts
} from "./result-presentation.ts";

/**
 * Native read interpretation, shared by the native and selective-read adapters.
 * Each callback interprets its borrowed arguments and result again.
 */

/** One read item per requested file; selections of one file count once. */
export function readSummaryItems(path: string | undefined, cwd: string): SummaryItem[] | undefined {
  return path === undefined ? undefined : [pathSummaryItem("read", path, cwd)];
}

export function readExploration(parts: InvocationPart[], path: string): ExplorationItem[] {
  return [{ parts, scope: { kind: "file", value: path } }];
}

/** Detail notices. Collapsed cards also keep the diagnostics of the retained text. */
export function readNotices(result: BorrowedToolResult, expanded: boolean): DisplayNotice[] {
  return [...nativeResultNotices(result.details), ...(expanded ? [] : textDiagnostics(result))];
}

/**
 * The parts of one retained text block. `highlight` marks only completed source
 * text; diagnostics and image captions are never source coordinates.
 */
export function readTextParts(
  text: string,
  context: ResultTextContext,
  highlight?: (source: string) => readonly CodeSelectionRange[]
): ResultTextPart[] {
  const complete = !context.isError && !context.isPartial && !context.isCancelled;

  return nativeResultParts("read", text, {}, context, complete ? highlight : undefined);
}

export function readImageCaptionMimeType(text: string): string | undefined {
  return nativeImageCaption(text)?.mimeType;
}

function textDiagnostics(result: BorrowedToolResult): DisplayNotice[] {
  const hasImages = result.content.some((block) => block.type === "image");

  return result.content.flatMap((block, contentIndex) =>
    block.type === "text"
      ? readTextParts(block.text, {
          result,
          contentIndex,
          expanded: false,
          isError: false,
          isPartial: false,
          isCancelled: false,
          hasImages
        })
          .filter((part) => part.kind === "warning")
          .map((part) => ({ kind: "warning" as const, text: part.text }))
      : []
  );
}

export const nativeReadAdapter: ToolDisplayAdapter = {
  id: "pi:read",
  family: "read",
  invocation: (args) => nativeInvocationParts("read", args, "read"),
  summaryItems: (args, { cwd }) => readSummaryItems(nativeFilePath(args), cwd),
  notices: readNotices,
  textParts: (text, _args, context) => readTextParts(text, context),
  imageCaptionMimeType: readImageCaptionMimeType,
  exploration(args) {
    const path = nativeFilePath(args);

    return path === undefined
      ? undefined
      : readExploration(nativeInvocationParts("read", args, "read"), path);
  }
};
