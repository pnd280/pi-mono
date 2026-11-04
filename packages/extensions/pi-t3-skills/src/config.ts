import { readScopedSections, type ScopedSection } from "@pi-mono/libs/settings-file";
import {
  defaultSkillReferenceFormat,
  skillReferenceFormatSchema
} from "@pi-mono/utils/skill-reference";
import { z } from "zod";

const sectionSchema = z.strictObject({
  expansionFormat: skillReferenceFormatSchema.optional()
});

function readExpansionFormat(section: ScopedSection): string | undefined {
  return section.status === "read"
    ? sectionSchema.safeParse(section.value).data?.expansionFormat
    : undefined;
}

/** Only the current directory's trusted project settings can override global settings. */
export function loadExpansionFormat(
  cwd: string,
  { projectTrusted }: { projectTrusted: boolean }
): string {
  const [global, project] = readScopedSections({ cwd, projectTrusted }, "ext.pi-t3-skills").map(
    readExpansionFormat
  );

  return project ?? global ?? defaultSkillReferenceFormat;
}
