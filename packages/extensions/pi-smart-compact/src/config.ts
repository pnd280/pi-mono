import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

export const thinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max"
]);

const configSchema = z.strictObject({
  model: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/\S+$/u)
    .optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  applyToManual: z.boolean().optional(),
  applyToAuto: z.boolean().optional()
});
const settingsSchema = z.object({ "ext.pi-smart-compact": configSchema.optional() });

export type CompactConfig = z.output<typeof configSchema>;

function readSection(path: string): CompactConfig {
  try {
    const parsed = settingsSchema.safeParse(readSettingsRecord(path));
    if (parsed.success) return parsed.data["ext.pi-smart-compact"] ?? {};
  } catch {
    // Report only the redacted settings error below.
  }

  throw new Error(
    "pi-smart-compact: invalid or unreadable settings. Check ext.pi-smart-compact in global and trusted project settings.json, then /reload."
  );
}

/** Only absent fields inherit; invalid settings must not silently select another model. */
export function loadCompactConfig(
  cwd: string,
  {
    projectTrusted = false,
    agentDir = getAgentDir()
  }: { projectTrusted?: boolean; agentDir?: string } = {}
): CompactConfig {
  const global = readSection(join(agentDir, "settings.json"));
  const project = projectTrusted ? readSection(join(cwd, CONFIG_DIR_NAME, "settings.json")) : {};

  return { ...global, ...project };
}
