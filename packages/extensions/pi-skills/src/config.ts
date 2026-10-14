import { readScopedSettings, readSettingsRecord } from "@pi-mono/libs/settings-file";
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
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): string {
  const [global, project] = readScopedSettings(
    { cwd, projectTrusted, agentDir },
    readExpansionFormat
  );

  return project ?? global ?? defaultExpansionFormat;
}
