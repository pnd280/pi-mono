import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

import { defaultExpansionFormat } from "./tokens.ts";

const sectionSchema = z.strictObject({
  expansionFormat: z.string().max(512).includes("{path}").optional()
});

function readExpansionFormat(path: string): string | undefined {
  try {
    return sectionSchema.safeParse(readSettingsRecord(path)["ext.pi-skills"]).data?.expansionFormat;
  } catch {
    return undefined;
  }
}

/** Only the current directory's trusted project settings can override global settings. */
export function loadExpansionFormat(
  cwd: string,
  {
    projectTrusted = false,
    agentDir = getAgentDir()
  }: { projectTrusted?: boolean; agentDir?: string } = {}
): string {
  const global = readExpansionFormat(join(agentDir, "settings.json"));
  const project = projectTrusted
    ? readExpansionFormat(join(cwd, CONFIG_DIR_NAME, "settings.json"))
    : undefined;

  return project ?? global ?? defaultExpansionFormat;
}
