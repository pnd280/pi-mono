import { readScopedSections } from "@pi-mono/libs/settings-file";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

const configSchema = z.strictObject({
  model: modelReferenceSchema,
  thinkingLevel: z.enum(MODEL_THINKING_LEVELS)
});
const partialSchema = configSchema.partial();
const sectionSchema = z.strictObject({ "auto-title": partialSchema.optional() }).optional();

export type TitleConfig = z.output<typeof configSchema>;

/** The config, or the reason naming cannot use it. */
export type TitleSettings = { config: TitleConfig } | { problem: string };

/** Merge trusted cwd overrides without writing settings or choosing fallback models. */
export function loadTitleConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): TitleSettings {
  const sections: (z.output<typeof partialSchema> | undefined)[] = [];

  for (const section of readScopedSections(
    { cwd, projectTrusted, agentDir },
    "ext.pi-session-utils"
  )) {
    const parsed = section.status === "read" ? sectionSchema.safeParse(section.value) : undefined;
    // Invalid settings must not silently route conversation text to a different model.
    if (!parsed?.success)
      return {
        problem: `Cannot use ext.pi-session-utils settings in ${compactDisplayText(section.path)}. Check access, syntax, the 1 MiB file limit, and the auto-title fields, then /reload.`
      };
    sections.push(parsed.data?.["auto-title"]);
  }

  const config = configSchema.safeParse(Object.assign({}, ...sections)).data;

  return config
    ? { config }
    : {
        problem:
          "Configure model and thinkingLevel under ext.pi-session-utils.auto-title in global or trusted project settings.json, then /reload."
      };
}
