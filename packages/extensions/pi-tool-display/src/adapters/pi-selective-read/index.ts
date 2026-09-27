import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { selectSource, selectionLabel } from "@pi-mono/utils/source-selection";

import type {
  BorrowedToolResult,
  InvocationPart,
  ResultTextPart,
  ToolDisplayAdapter
} from "../../contracts.ts";
import { invocationParts } from "../../invocation.ts";
import { pathSummaryItem } from "../../summary/items.ts";
import { nativeAdapter } from "../native/index.ts";
import { nativeResultParts } from "../native/result-presentation.ts";
import { argsSchema, parametersSchema, resultSchema } from "./schema.ts";

const native = nativeAdapter("read");
if (!native) throw new Error("Native read display adapter is unavailable.");

function supports(args: unknown, result: BorrowedToolResult): boolean {
  const input = argsSchema.safeParse(args);
  const output = resultSchema.safeParse(result);

  return (
    input.success &&
    output.success &&
    (!output.data.details?.selectiveRead || input.data.selection !== undefined)
  );
}

function invocation(args: unknown): InvocationPart[] {
  const input = argsSchema.safeParse(args).data;
  const parts = invocationParts("read", input ?? args, "read");
  const selection = input?.selection;
  if (selection)
    parts.push({ kind: "annotation", text: ` · selection ${selectionLabel(selection)}` });

  return parts;
}

export const selectiveReadDisplayAdapter: ToolDisplayAdapter = {
  ...native,
  id: "pi-selective-read:read",
  supports,
  invocation,
  summaryItems(args, { cwd }) {
    const path = argsSchema.safeParse(args).data?.path;

    // One read item per requested file; selections of one file count once.
    return path === undefined ? undefined : [pathSummaryItem("read", path, cwd)];
  },
  exploration(args, result) {
    const input = argsSchema.safeParse(args);
    if (!input.success || (result && !supports(args, result))) return undefined;

    return [{ parts: invocation(args), scope: { kind: "file", value: input.data.path } }];
  },
  notices(result, expanded) {
    const parsed = resultSchema.safeParse(result);
    const count = parsed.data?.details?.selectiveRead?.sourceBlocks;

    const source =
      count === undefined ? result : { ...result, content: result.content.slice(0, count) };
    const notices = native.notices?.(source, expanded) ?? [];

    if (!expanded && parsed.success) {
      for (const [contentIndex, block] of source.content.entries()) {
        if (block.type !== "text") continue;
        const parts = nativeResultParts(
          "read",
          block.text,
          {},
          {
            result: source,
            contentIndex,
            expanded: false,
            isError: false,
            isPartial: false,
            isCancelled: false
          }
        );
        for (const part of parts)
          if (
            part.kind === "warning" &&
            !notices.some((notice) => "text" in notice && notice.text === part.text)
          )
            notices.push({ kind: "warning", text: part.text });
      }
    }

    return notices;
  },
  textParts(text, args, context): ResultTextPart[] {
    const input = argsSchema.safeParse(args).data;
    const result = resultSchema.safeParse(context.result).data;
    if (!input || !result || !supports(args, context.result))
      return [{ kind: context.isError ? "error" : "output", text }];

    const sourceBlocks = result.details?.selectiveRead?.sourceBlocks;
    // Only the recorded appended block is a model preview. Source lookalikes remain source.
    if (sourceBlocks !== undefined && context.contentIndex === sourceBlocks) return [];
    const parts = nativeResultParts("read", text, input, context);
    const selection = input.selection;
    if (
      !selection ||
      context.isError ||
      context.isPartial ||
      context.isCancelled ||
      result.content.some((block) => block.type === "image") ||
      text.startsWith("Read image file [image/")
    )
      return parts;

    const precedingLines = result.content
      .slice(0, context.contentIndex)
      .reduce(
        (count, block) => count + (block.type === "text" ? block.text.split("\n").length : 0),
        0
      );
    const start = Math.max(0, (input.offset ?? 1) - 1);
    const firstLine = Math.trunc(start) + 1 + precedingLines;
    const requested =
      input.limit === undefined
        ? Infinity
        : Math.max(0, Math.trunc(start + input.limit) - Math.trunc(start));
    const remaining = Math.max(
      0,
      (result.details?.truncation?.outputLines ?? requested) - precedingLines
    );

    return parts.map((part, index) => {
      // Native read diagnostics are separate parts, never source coordinates.
      if (index !== 0 || part.kind !== "output") return part;
      const lines = part.text === "" ? [] : part.text.split("\n");
      if (part.text.endsWith("\n")) lines.pop();
      const selected = selectSource(lines.slice(0, remaining), firstLine, selection);

      return {
        ...part,
        selection: selected.lines.map((line) => ({
          line: line.index,
          start: line.before.length,
          end: line.before.length + line.text.length
        }))
      };
    });
  }
};

/** Select only the workspace extension's current read contract, never an arbitrary read override. */
export function piSelectiveReadAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (!tool || tool.name !== "read" || ["builtin", "sdk"].includes(tool.sourceInfo.source))
    return undefined;
  const path = tool.sourceInfo.path.replaceAll("\\", "/");
  const owned =
    /^npm:pi-selective-read(?:@[^/]+)?$/.test(tool.sourceInfo.source) ||
    /(?:^|\/)pi-selective-read\/(?:src\/)?index\.[cm]?[jt]s$/.test(path);

  return owned && parametersSchema.safeParse(tool.parameters).success
    ? selectiveReadDisplayAdapter
    : undefined;
}
