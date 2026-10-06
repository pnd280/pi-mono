import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsRecord } from "@pi-mono/libs/settings-file";
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
  {
    projectTrusted = false,
    agentDir = getAgentDir()
  }: { projectTrusted?: boolean; agentDir?: string } = {}
): SubagentsConfig {
  const global = readSection(join(agentDir, "settings.json"));
  const project = projectTrusted ? readSection(join(cwd, CONFIG_DIR_NAME, "settings.json")) : {};

  return {
    maxDepth: project.maxDepth ?? global.maxDepth ?? 2,
    maxConcurrent: project.maxConcurrent ?? global.maxConcurrent ?? 8,
    maxQueued: project.maxQueued ?? global.maxQueued ?? 8
  };
}
