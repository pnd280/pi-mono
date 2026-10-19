import { readScopedSettings, readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const sectionSchema = z.object({
  collapseWidgetByDefault: z.boolean().optional()
});
const settingsSchema = z.object({ "ext.pi-todo": sectionSchema.optional() });

type TodoConfig = { [Key in keyof z.output<typeof sectionSchema>]-?: boolean };

function readSection(path: string): z.output<typeof sectionSchema> {
  try {
    return settingsSchema.safeParse(readSettingsRecord(path)).data?.["ext.pi-todo"] ?? {};
  } catch {
    return {};
  }
}

/** Only the current directory's trusted project settings participate. */
export function loadTodoConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): TodoConfig {
  const [global, project = {}] = readScopedSettings({ cwd, projectTrusted, agentDir }, readSection);

  return {
    collapseWidgetByDefault:
      project.collapseWidgetByDefault ?? global.collapseWidgetByDefault ?? false
  };
}
