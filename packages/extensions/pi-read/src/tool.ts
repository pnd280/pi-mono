import type { createReadToolDefinition, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { toToolSchema } from "@pi-mono/libs/tool-schema";
import { Type, type Static } from "typebox";

import { createReadRenderers } from "./render.ts";
import { appendPreview, type ReadResult, type SelectiveReadDetails } from "./result.ts";
import { selectionInputSchema, selectionSchema } from "./selection.ts";

export type SelectiveReadTool = ReturnType<typeof createSelectiveReadTool>;

export type SelectiveReadParams = Static<SelectiveReadTool["parameters"]>;

export function createSelectiveReadTool(base: ReturnType<typeof createReadToolDefinition>) {
  const { properties, ...nativeSchema } = base.parameters;
  const parameters = Type.Object(
    {
      ...properties,
      selection: Type.Optional(
        toToolSchema(
          selectionInputSchema.describe(
            "Source span for highlighting and, in direct calls, a bounded orientation preview; codemode receives the source without it. Does not change the read window; use offset and limit for context."
          )
        )
      )
    },
    nativeSchema
  );

  return {
    ...base,
    parameters,
    promptGuidelines: [
      ...(base.promptGuidelines ?? []),
      "For references such as file.ts:12, file.ts:12-15, or file.ts:12:4-15:9, give read.path only the filename and put the coordinates in read.selection."
    ],
    async execute(id, args, signal, onUpdate, ctx): Promise<ReadResult> {
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
  } satisfies ToolDefinition<typeof parameters, SelectiveReadDetails | undefined, unknown>;
}
