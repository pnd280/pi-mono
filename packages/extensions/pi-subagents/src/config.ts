import { readScopedSettings, readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const sectionSchema = z.object({
  maxDepth: z.int().nonnegative().optional().catch(undefined),
  maxConcurrent: z.int().positive().optional().catch(undefined),
  maxQueued: z.int().nonnegative().optional().catch(undefined)
});
const settingsSchema = z.object({ "ext.pi-subagents": sectionSchema.optional() });

export type SubagentsConfig = {
  maxDepth: number;
  maxConcurrent: number;
  maxQueued: number;
};

function readSection(path: string): z.output<typeof sectionSchema> {
  try {
    return settingsSchema.safeParse(readSettingsRecord(path)).data?.["ext.pi-subagents"] ?? {};
  } catch {
    return {};
  }
}

export function loadConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): SubagentsConfig {
  const [global, project = {}] = readScopedSettings({ cwd, projectTrusted, agentDir }, readSection);

  return {
    maxDepth: project.maxDepth ?? global.maxDepth ?? 2,
    maxConcurrent: project.maxConcurrent ?? global.maxConcurrent ?? 8,
    maxQueued: project.maxQueued ?? global.maxQueued ?? 8
  };
}
