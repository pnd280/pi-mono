import type { CustomEntry, EntryRenderOptions, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import { thinkingLevelSchema } from "./config.ts";

export const summaryModelEntryType = "smart-compaction-model";

// Ignore unknown stored fields; malformed known fields must not reach the renderer.
const summaryModelSchema = z.object({
  model: z.string().min(1),
  thinkingLevel: thinkingLevelSchema,
  trigger: z.enum(["tool", "manual", "threshold", "overflow"])
});

/** Session entry excluded from model context; records who generated a default summary. */
export type SummaryModelEntry = z.output<typeof summaryModelSchema>;

function describeSummaryModel(entry: SummaryModelEntry): string {
  return `Compacted with ${compactDisplayText(entry.model)}:${entry.thinkingLevel} (${entry.trigger})`;
}

export function renderSummaryModel(
  entry: CustomEntry,
  _options: EntryRenderOptions,
  theme: Pick<Theme, "fg">
) {
  const parsed = summaryModelSchema.safeParse(entry.data);
  if (!parsed.success) return;

  return new Text(theme.fg("dim", describeSummaryModel(parsed.data)), 1, 0);
}
