import { readScopedSections, type ScopedSection } from "@pi-mono/libs/settings-file";
import { z } from "zod";

import { defaultExpansionFormat } from "./tokens.ts";

const sectionSchema = z.strictObject({
  expansionFormat: z.string().max(512).includes("{path}").optional()
});

function readExpansionFormat(section: ScopedSection): string | undefined {
  return section.status === "read"
    ? sectionSchema.safeParse(section.value).data?.expansionFormat
    : undefined;
}

/** Only the current directory's trusted project settings can override global settings. */
export function loadExpansionFormat(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): string {
  const [global, project] = readScopedSections(
    { cwd, projectTrusted, agentDir },
    "ext.pi-skills"
  ).map(readExpansionFormat);

  return project ?? global ?? defaultExpansionFormat;
}
