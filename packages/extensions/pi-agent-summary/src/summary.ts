import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

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

// The mapped type rejects both missing and unknown host thinking levels.
const thinkingLevels = {
  off: "off",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
} as const satisfies { [Level in ThinkingLevel]: Level };

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
  // Absent in summaries saved before model capture and in runs without a selected model.
  model: z
    .object({
      provider: z.string().min(1),
      id: z.string().min(1),
      thinkingLevel: z.enum(thinkingLevels)
    })
    .optional(),
  files: z.array(fileChangeSchema)
});

export type FileChange = z.infer<typeof fileChangeSchema>;

export type RunSummary = z.infer<typeof summarySchema>;

const finishTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true
});

export function formatFinishTime(finishedAt: number): string {
  return finishTimeFormatter.format(finishedAt);
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (totalSeconds >= 60) return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}
