import { readScopedSections, type ScopedSection } from "@pi-mono/libs/settings-file";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

const configSchema = z.strictObject({
  model: modelReferenceSchema,
  thinkingLevel: z.enum(MODEL_THINKING_LEVELS)
});
const sectionSchema = z
  .strictObject({ "auto-title": configSchema.partial().optional() })
  .optional();

export type TitleConfig = z.output<typeof configSchema>;

function readSection(section: ScopedSection) {
  const parsed = section.status === "read" ? sectionSchema.safeParse(section.value) : undefined;

  return parsed?.success ? (parsed.data?.["auto-title"] ?? {}) : undefined;
}

/** Merge trusted cwd overrides without writing settings or choosing fallback models. */
export function loadTitleConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): TitleConfig | undefined {
  const sections = readScopedSections(
    { cwd, projectTrusted, agentDir },
    "ext.pi-session-utils"
  ).map(readSection);
  // Invalid settings must not silently route conversation text to a different model.
  if (sections.includes(undefined)) return undefined;
  const [global, project] = sections;

  return configSchema.safeParse({ ...global, ...project }).data;
}
