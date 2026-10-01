import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsFile, readSettingsRecord } from "@pi-mono/libs/settings-file";
import { expandHomePath } from "@pi-mono/utils/paths";
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
  applyToAuto: z.boolean().optional(),
  instructionsFile: z.string().trim().min(1).optional()
});
const settingsSchema = z.object({ "ext.pi-smart-compact": configSchema.optional() });

export type CompactSettings = z.output<typeof configSchema>;

export type CompactConfig = Omit<CompactSettings, "instructionsFile"> & { instructions?: string };

function readSection(path: string): CompactSettings {
  try {
    const parsed = settingsSchema.safeParse(readSettingsRecord(path));

    if (parsed.success) {
      const config = parsed.data["ext.pi-smart-compact"] ?? {};
      if (config.instructionsFile !== undefined)
        config.instructionsFile = resolve(
          dirname(path),
          expandHomePath(config.instructionsFile, homedir())
        );

      return config;
    }
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

  const { instructionsFile, ...config } = { ...global, ...project };
  if (instructionsFile === undefined) return config;

  try {
    const instructions = readSettingsFile(instructionsFile);
    if (instructions !== undefined) return { ...config, instructions: instructions.trim() };
  } catch {
    // Do not expose file contents or silently ignore a configured focus.
  }

  throw new Error(
    "pi-smart-compact: invalid or unreadable instructions file (expected a UTF-8 text file up to 1 MiB). Check ext.pi-smart-compact.instructionsFile, then /reload."
  );
}
