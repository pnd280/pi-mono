import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

import { counterSchema, maxCounters } from "./counters.ts";
import { maxMilestones, milestoneSchema } from "./milestones.ts";

export const summaryEntryType = "pi-agent-summary.summary";

const countSchema = z.int().nonnegative();
const fileChangeSchema = z.discriminatedUnion("status", [
  z.object({
    path: z.string().min(1),
    status: z.literal("available"),
    added: countSchema,
    removed: countSchema
  }),
  z.object({
    path: z.string().min(1),
    status: z.literal("unavailable"),
    reason: z.string().min(1)
  })
]);

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;

/** `never` when the host has a thinking level that the shared list lacks. */
type HostLevels = ThinkingLevel extends (typeof MODEL_THINKING_LEVELS)[number]
  ? readonly ThinkingLevel[]
  : never;

// Rejects both missing and unknown host thinking levels at compile time.
const thinkingLevels = MODEL_THINKING_LEVELS satisfies HostLevels;

// Ignore unknown fields, but never render invalid statistics from session JSON.
export const summarySchema = z.object({
  durationMs: countSchema,
  finishedAt: countSchema.max(8_640_000_000_000_000),
  bashCalls: countSchema,
  throughput: z
    .object({
      outputTokens: countSchema.positive(),
      durationMs: z.number().positive()
    })
    .optional(),
  // Models that answered, in order of first use. Absent in runs without a response.
  models: z
    .array(
      z.object({
        provider: z.string().min(1),
        id: z.string().min(1),
        // Absent for responses Pi did not request with a thinking level.
        thinkingLevel: z.enum(thinkingLevels).optional()
      })
    )
    .min(1)
    .optional(),
  // Milestones other extensions declared, in order of first declaration.
  milestones: z.array(milestoneSchema.shape.text).min(1).max(maxMilestones).optional(),
  // Counters other extensions added to, in order of first addition.
  counters: z
    .array(counterSchema.extend({ count: countSchema.positive() }))
    .min(1)
    .max(maxCounters)
    .optional(),
  files: z.array(fileChangeSchema)
});

export type FileChange = z.infer<typeof fileChangeSchema>;

export type RunSummary = z.infer<typeof summarySchema>;
