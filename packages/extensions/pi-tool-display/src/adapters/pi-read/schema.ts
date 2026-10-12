import { retainedSelectionSchema } from "pi-read/result";
import { z } from "zod";

// Pi omits optional nulls before execution, but standalone cards receive raw arguments.
function optionalArgument<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === null ? undefined : value), schema.optional());
}

// Read execution ignores unknown top-level fields; keep selection validation strict.
export const argsSchema = z.object({
  path: z.string().min(1),
  offset: optionalArgument(z.number()),
  limit: optionalArgument(z.number()),
  selection: optionalArgument(retainedSelectionSchema)
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

export const resultSchema = z.object({
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() })
    ])
  ),
  details: z.unknown().optional()
});
