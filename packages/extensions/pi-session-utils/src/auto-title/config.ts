import { readScopedSettings, readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const configSchema = z.strictObject({
  model: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/\S+$/u),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"])
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
