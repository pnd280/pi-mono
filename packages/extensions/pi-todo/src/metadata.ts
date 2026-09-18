import type { JsonValue } from "@earendil-works/pi-ai";
import { z } from "zod";

import type { TaskMetadata } from "./types.ts";

/** Parse entries so literal __proto__ keys survive without changing object prototypes. */
export const jsonMetadataSchema: z.ZodType<TaskMetadata> = z
  .custom<object>((value): value is object => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  })
  .transform((value) => Object.entries(value))
  .pipe(z.array(z.tuple([z.string(), z.lazy(() => jsonValueSchema)])))
  .transform((entries) => Object.fromEntries<JsonValue>(entries));

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    jsonMetadataSchema
  ])
);
