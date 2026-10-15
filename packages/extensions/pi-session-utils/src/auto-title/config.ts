import { MODEL_THINKING_LEVELS } from "@earendil-works/pi-ai/providers/model-schema";
import { readScopedSettings, readSettingsRecord } from "@pi-mono/libs/settings-file";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { z } from "zod";

const configSchema = z.strictObject({
  model: modelReferenceSchema,
  thinkingLevel: z.enum(MODEL_THINKING_LEVELS)
});
const settingsSchema = z.object({
  "ext.pi-session-utils": z
    .strictObject({ "auto-title": configSchema.partial().optional() })
    .optional()
});

export type TitleConfig = z.output<typeof configSchema>;

function readSection(path: string) {
  try {
    const parsed = settingsSchema.safeParse(readSettingsRecord(path));

    return parsed.success ? (parsed.data["ext.pi-session-utils"]?.["auto-title"] ?? {}) : undefined;
  } catch {
    return undefined;
  }
}

/** Merge trusted cwd overrides without writing settings or choosing fallback models. */
export function loadTitleConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): TitleConfig | undefined {
  const sections = readScopedSettings({ cwd, projectTrusted, agentDir }, readSection);
  // Invalid settings must not silently route conversation text to a different model.
  if (sections.includes(undefined)) return undefined;
  const [global, project] = sections;

  return configSchema.safeParse({ ...global, ...project }).data;
}
