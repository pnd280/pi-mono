import { Type, type Static } from "@earendil-works/pi-ai";
import { createReadToolDefinition, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { selectionInputSchema, selectionSchema } from "@pi-mono/utils/source-selection";

import { createReadRenderers } from "./render.ts";
import { appendPreview, type SelectiveReadDetails } from "./result.ts";

const parameters = Type.Object({
  ...createReadToolDefinition(process.cwd()).parameters.properties,
  selection: Type.Optional(
    toToolSchema(
      selectionInputSchema.describe(
        "Source span for highlighting and a bounded orientation preview. Coordinates must be positive safe integers. Does not change the read window; use offset and limit for context."
      )
    )
  )
});

export type SelectiveReadParams = Static<typeof parameters>;

export type SelectiveReadTool = ToolDefinition<
  typeof parameters,
  SelectiveReadDetails | undefined,
  unknown
>;

export function createSelectiveReadTool(
  base: ReturnType<typeof createReadToolDefinition>
): SelectiveReadTool {
  return {
    ...base,
    parameters,
    description: `${base.description} Supply selection to mark a source span while retaining surrounding context. A separate orientation preview is limited to five lines and 500 Unicode code points per line.`,
    promptGuidelines: [
      ...(base.promptGuidelines ?? []),
      "For references such as file.ts:12, file.ts:12-15, or file.ts:12:4-15:9, give read.path only the filename and put the coordinates in read.selection. Choose read.offset and read.limit independently to include context. The selected preview is for orientation; use the original read content for exact edits. An ellipsis (…) in the preview marks omitted text, not file content."
    ],
    async execute(id, args, signal, onUpdate, ctx) {
      const { selection: input, ...window } = args;
      const parsed = input === undefined ? undefined : selectionSchema.safeParse(input);
      if (parsed && !parsed.success)
        throw new Error(
          "Invalid read selection: use positive safe integer coordinates with the end after the start."
        );
      const result = await base.execute(id, window, signal, onUpdate, ctx);

      return parsed?.success ? appendPreview(result, window, parsed.data) : result;
    },
    ...createReadRenderers(base)
  };
}
