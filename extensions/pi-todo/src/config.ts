import { readScopedSections, type ScopedSection } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const sectionSchema = z.object({
  collapseWidgetByDefault: z.boolean().optional()
});

type TodoConfig = { [Key in keyof z.output<typeof sectionSchema>]-?: boolean };

function readSection(section: ScopedSection): z.output<typeof sectionSchema> {
  return section.status === "read" ? (sectionSchema.safeParse(section.value).data ?? {}) : {};
}

/** Only the current directory's trusted project settings participate. */
export function loadTodoConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): TodoConfig {
  const [global = {}, project = {}] = readScopedSections(
    { cwd, projectTrusted, agentDir },
    "ext.pi-todo"
  ).map(readSection);

  return {
    collapseWidgetByDefault:
      project.collapseWidgetByDefault ?? global.collapseWidgetByDefault ?? false
  };
}
