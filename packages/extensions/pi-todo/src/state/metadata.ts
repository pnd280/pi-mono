import type { JsonValue } from "@earendil-works/pi-ai";
import { z } from "zod";

import { isPlainObject } from "./limits.ts";
import type { TaskMetadata } from "./model.ts";

/** Parse entries so literal __proto__ keys survive without changing object prototypes. */
export const jsonMetadataSchema: z.ZodType<TaskMetadata> = z
  .custom<object>(isPlainObject)
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
