import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsFile } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const configSchema = z.strictObject({
  model: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/\S+$/u)
    .optional(),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
  applyToManual: z.boolean().optional(),
  applyToAuto: z.boolean().optional()
});
const settingsSchema = z.object({ "ext.pi-smart-compact": configSchema.optional() });

export type CompactConfig = z.output<typeof configSchema>;

function readSection(path: string): CompactConfig {
  try {
    const source = readSettingsFile(path);

    if (source !== undefined) {
      const raw: unknown = JSON.parse(source);
      const parsed = settingsSchema.safeParse(raw);
      if (parsed.success) return parsed.data["ext.pi-smart-compact"] ?? {};
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
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
