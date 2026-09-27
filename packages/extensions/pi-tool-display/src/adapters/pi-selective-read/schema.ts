import { selectionInputSchema, selectionSchema } from "@pi-mono/utils/source-selection";
import { z } from "zod";

// Pi omits optional nulls before execution, but retained display arguments stay raw.
function optionalArgument<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

const selectionArgumentSchema = selectionInputSchema
  .extend({
    startColumn: optionalArgument(selectionInputSchema.shape.startColumn),
    endLine: optionalArgument(selectionInputSchema.shape.endLine),
    endColumn: optionalArgument(selectionInputSchema.shape.endColumn)
  })
  .pipe(selectionSchema);

// Read execution ignores unknown top-level fields; keep selection validation strict.
export const argsSchema = z.object({
  path: z.string().min(1),
  offset: optionalArgument(z.number()),
  limit: optionalArgument(z.number()),
  selection: optionalArgument(selectionArgumentSchema)
});

// Projected tool schemas omit integer bounds; argsSchema still validates coordinates.
const coordinate = z.object({ type: z.literal("integer") });

/** The current extension adds one optional selection to Pi's native read parameters. */
export const parametersSchema = z.object({
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

export const detailsSchema = z
  .object({
    selectiveRead: z.object({ sourceBlocks: z.int().positive() }).optional(),
    truncation: z.object({ outputLines: z.int().nonnegative() }).optional()
  })
  .optional();

export const resultSchema = z
  .object({
    content: z.array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() })
      ])
    ),
    details: detailsSchema
  })
  .superRefine((result, ctx) => {
    const count = result.details?.selectiveRead?.sourceBlocks;
    if (count === undefined) return;
    if (
      count !== result.content.length - 1 ||
      result.content.some((block) => block.type !== "text")
    )
      ctx.addIssue({ code: "custom", message: "Invalid selective-read source block boundary" });
  });
