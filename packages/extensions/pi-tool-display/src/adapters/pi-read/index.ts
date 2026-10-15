import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { interpretReadResult, retainedSelectionSchema, selectionLabel } from "pi-read/result";
import { z } from "zod";

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

// Pi omits optional nulls before execution, but standalone cards receive raw arguments.
function optionalArgument<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

// Read execution ignores unknown top-level fields; keep selection validation strict.
const argsSchema = z.object({
  path: z.string().min(1),
  offset: optionalArgument(z.number()),
  limit: optionalArgument(z.number()),
  selection: optionalArgument(retainedSelectionSchema)
});

// Projected tool schemas omit integer bounds; argsSchema still validates coordinates.
const coordinate = z.object({ type: z.literal("integer") });

/** The current extension adds one optional selection to Pi's native read parameters. */
const parametersSchema = z.object({
  type: z.literal("object"),
  required: z.tuple([z.literal("path")]),
  properties: z.object({
    path: z.object({ type: z.literal("string") }),
    offset: z.object({ type: z.literal("number") }),
    limit: z.object({ type: z.literal("number") }),
    selection: z.object({
      type: z.literal("object"),
      additionalProperties: z.literal(false),
      required: z.tuple([z.literal("startLine")]),
      properties: z.object({
        startLine: coordinate,
        startColumn: coordinate,
        endLine: coordinate,
        endColumn: coordinate
      })
    })
  })
});

const resultSchema = z.object({
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() })
    ])
  ),
  details: z.unknown().optional()
});

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
