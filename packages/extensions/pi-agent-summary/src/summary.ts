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

// Ignore unknown fields, but never render invalid statistics from session JSON.
export const summarySchema = z.object({
  durationMs: countSchema,
  bashCalls: countSchema,
  files: z.array(fileChangeSchema)
});

export type FileChange = z.infer<typeof fileChangeSchema>;

export type RunSummary = z.infer<typeof summarySchema>;

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (totalSeconds >= 60) return `${minutes}m ${seconds}s`;

  return `${seconds}s`;
}
