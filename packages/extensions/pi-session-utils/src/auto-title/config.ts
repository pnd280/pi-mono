import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readSettingsFile } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const configSchema = z.strictObject({
  model: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/\S+$/u),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"])
});
const settingsSchema = z.object({
  "ext.pi-session-utils": z
    .strictObject({ "auto-title": configSchema.partial().optional() })
    .optional()
});

export type TitleConfig = z.output<typeof configSchema>;

function readSection(path: string) {
  try {
    const source = readSettingsFile(path);
    if (source === undefined) return undefined;
    const raw: unknown = JSON.parse(source);
    const parsed = settingsSchema.safeParse(raw);

    return parsed.success ? (parsed.data["ext.pi-session-utils"]?.["auto-title"] ?? {}) : undefined;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};

    return undefined;
  }
}

/** Merge trusted cwd overrides without writing settings or choosing fallback models. */
export function loadTitleConfig(
  cwd: string,
  {
    projectTrusted = false,
    agentDir = getAgentDir()
  }: { projectTrusted?: boolean; agentDir?: string } = {}
): TitleConfig | undefined {
  const global = readSection(join(agentDir, "settings.json"));
  const project = projectTrusted ? readSection(join(cwd, CONFIG_DIR_NAME, "settings.json")) : {};
  // Invalid settings must not silently route conversation text to a different model.
  if (!global || !project) return undefined;

  return configSchema.safeParse({ ...global, ...project }).data;
}
