import { z } from "zod";

const objectSchema = z.object({});

export const nonemptyStringSchema = z.string().min(1);

export const gatewayActionSchema = z.enum([
  "install",
  "ui-messages",
  "auth-start",
  "auth-complete"
]);

export const argumentSchemas = {
  direct: objectSchema,
  script: z.object({ code: z.string() }),
  namespace: z.object({ tool: nonemptyStringSchema, args: objectSchema.optional() }),
  gateway: z.object({
    tool: z.string().optional(),
    connect: z.string().optional(),
    describe: z.string().optional(),
    instructions: z.string().optional(),
    search: z.string().optional(),
    server: z.string().optional(),
    action: z.string().optional(),
    url: z.string().optional(),
    target: z.string().optional(),
    args: z.union([z.string(), objectSchema]).optional()
  })
};

export type ToolKind = keyof typeof argumentSchemas;

export const resultDetailsSchema = z.looseObject({
  error: z.string().optional(),
  server: z.string().optional(),
  mode: z.string().optional()
});

export const outputGuardSchema = z.object({
  truncated: z.literal(true),
  fullOutputPath: nonemptyStringSchema.optional().catch(undefined),
  writeError: nonemptyStringSchema.optional().catch(undefined)
});

export const omittedResultSchema = z.object({
  omitted: z.literal(true),
  fullResultPath: nonemptyStringSchema.optional().catch(undefined)
});

export const noticeDetailsSchema = z.object({
  error: nonemptyStringSchema.optional().catch(undefined),
  mode: z.string().optional().catch(undefined),
  calls: z.array(z.unknown()).optional().catch(undefined),
  resourceUri: nonemptyStringSchema.optional().catch(undefined),
  outputGuard: z.unknown().optional(),
  mcpResult: z.unknown().optional()
});

export const failedScriptCallSchema = z.object({
  ok: z.literal(false),
  error: z.string().optional().catch(undefined)
});

export const scriptSummarySchema = z.object({
  mode: z.literal("script"),
  calls: z
    .array(
      z.object({
        operation: z.enum(["call", "search", "describe"]),
        ok: z.boolean(),
        error: z.string().optional()
      })
    )
    .default([])
});

export const callIdentitySchema = z.object({
  server: nonemptyStringSchema,
  tool: nonemptyStringSchema,
  mode: z.literal("call").optional()
});

export const toolParametersSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()),
  required: z.unknown().optional()
});

export const stringPropertySchema = z.object({ type: z.literal("string") });

export const objectPropertySchema = z.object({ type: z.literal("object") });

export const requiredPropertiesSchema = z.array(z.unknown());

export const gatewayArgsPropertySchema = z.object({
  anyOf: z
    .array(z.unknown())
    .refine(
      (variants) =>
        variants.some((value) => stringPropertySchema.safeParse(value).success) &&
        variants.some((value) => objectPropertySchema.safeParse(value).success)
    )
});
