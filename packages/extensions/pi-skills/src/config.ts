import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsFile } from "@pi-mono/libs/settings-file";
import { z } from "zod";

import { defaultExpansionFormat } from "./tokens.ts";

const sectionSchema = z.strictObject({
  expansionFormat: z.string().max(512).includes("{path}").optional()
});
const settingsSchema = z.object({ "ext.pi-skills": sectionSchema.optional() });

type SkillSettings = z.output<typeof sectionSchema>;

function readSection(path: string): SkillSettings {
  try {
    const source = readSettingsFile(path);
    if (source === undefined) return {};
    const raw: unknown = JSON.parse(source);

    return settingsSchema.safeParse(raw).data?.["ext.pi-skills"] ?? {};
  } catch {
    return {};
  }
}

/** Only the current directory's trusted project settings can override global settings. */
export function loadSkillConfig(
  cwd: string,
  {
    projectTrusted = false,
    agentDir = getAgentDir()
  }: { projectTrusted?: boolean; agentDir?: string } = {}
): { expansionFormat: string } {
  const global = readSection(join(agentDir, "settings.json"));
  const project = projectTrusted ? readSection(join(cwd, CONFIG_DIR_NAME, "settings.json")) : {};

  return {
    expansionFormat: project.expansionFormat ?? global.expansionFormat ?? defaultExpansionFormat
  };
}
