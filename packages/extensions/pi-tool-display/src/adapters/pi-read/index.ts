import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { selectionLabel } from "@pi-mono/utils/source-selection";
import { interpretReadResult } from "pi-read/result";

import type {
  BorrowedToolResult,
  InvocationPart,
  ResultTextPart,
  ToolDisplayAdapter
} from "../../contracts.ts";
import { nativeInvocationParts, normalizeNativePathSpaces } from "../native/invocation.ts";
import {
  readExploration,
  readImageCaptionMimeType,
  readNotices,
  readSummaryItems,
  readTextParts
} from "../native/read.ts";
import { registeredBy } from "../provenance.ts";
import { argsSchema, parametersSchema, resultSchema } from "./schema.ts";

function supports(args: unknown, result: BorrowedToolResult): boolean {
  const input = argsSchema.safeParse(args);
  const output = resultSchema.safeParse(result);
  if (!input.success || !output.success) return false;
  const interpreted = interpretReadResult(result, input.data);

  return (
    interpreted.valid &&
    (interpreted.preview.kind === "absent" || input.data.selection !== undefined)
  );
}

function invocation(args: unknown): InvocationPart[] {
  const input = argsSchema.safeParse(args).data;
  const parts = nativeInvocationParts("read", input ?? args, "read");
  const selection = input?.selection;
  if (selection)
    parts.push({ kind: "annotation", text: ` · selection ${selectionLabel(selection)}` });

  return parts;
}

export const selectiveReadDisplayAdapter: ToolDisplayAdapter = {
  id: "pi-read:read",
  family: "read",
  supports,
  invocation,
  summaryItems(args, { cwd }) {
    const path = argsSchema.safeParse(args).data?.path;

    return readSummaryItems(path === undefined ? undefined : normalizeNativePathSpaces(path), cwd);
  },
  exploration(args, result) {
    const input = argsSchema.safeParse(args);
    if (!input.success || (result && !supports(args, result))) return undefined;

    return readExploration(invocation(args), normalizeNativePathSpaces(input.data.path));
  },
  notices(result, expanded) {
    const interpreted = interpretReadResult(result);

    return readNotices({ ...result, content: interpreted.sourceContent }, expanded);
  },
  imageCaptionMimeType: readImageCaptionMimeType,
  textParts(text, args, context): ResultTextPart[] {
    const input = argsSchema.safeParse(args).data;
    if (!input || !resultSchema.safeParse(context.result).success)
      return [{ kind: context.isError ? "error" : "output", text }];
    const interpreted = interpretReadResult(context.result, input);
    if (!interpreted.valid || (interpreted.preview.kind === "valid" && !input.selection))
      return [{ kind: context.isError ? "error" : "output", text }];

    // Only the recorded appended block is a model preview. Source lookalikes remain source.
    if (
      interpreted.preview.kind === "valid" &&
      context.contentIndex === interpreted.preview.contentIndex
    )
      return [];
    const selection = input.selection;
    const block = interpreted.blocks[context.contentIndex];

    return readTextParts(
      text,
      context,
      selection && block ? (source) => block.highlight(source, selection) : undefined
    );
  }
};

/** Select only the workspace extension's current read contract, never an arbitrary read override. */
export function piSelectiveReadAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  return tool?.name === "read" &&
    registeredBy(tool, "pi-read") &&
    parametersSchema.safeParse(tool.parameters).success
    ? selectiveReadDisplayAdapter
    : undefined;
}
