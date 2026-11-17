import {
  defaultSkillReferenceFormat,
  skillReferenceFormatSchema
} from "@pi-mono/utils/skill-reference";
import { z } from "zod";

import {
  readScopedSections,
  type ScopedSection,
  type SettingsScopeOptions
} from "../settings-file/index.ts";

const sectionSchema = z.strictObject({
  expansionFormat: skillReferenceFormatSchema.optional()
});

function readExpansionFormat(section: ScopedSection): string | undefined {
  return section.status === "read"
    ? sectionSchema.safeParse(section.value).data?.expansionFormat
    : undefined;
}

export type SkillReferenceFormatOptions = Omit<SettingsScopeOptions, "projectTrusted"> & {
  /** Defaults to untrusted. */
  projectTrusted?: boolean | undefined;
};

/**
 * The `expansionFormat` of the `key` section: the trusted current directory's valid value, then the global valid value, then the shared default. Invalid or unreadable sections are ignored without a warning.
 */
export function loadSkillReferenceFormat(
  key: string,
  { projectTrusted = false, ...scope }: SkillReferenceFormatOptions
): string {
  const [global, project] = readScopedSections({ ...scope, projectTrusted }, key).map(
    readExpansionFormat
  );

  return project ?? global ?? defaultSkillReferenceFormat;
}
