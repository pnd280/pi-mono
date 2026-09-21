import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const configSchema = z.strictObject({
  model: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/\S+$/u),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"])
});
const settingsSchema = z.object({ "ext.pi-session-title": configSchema.partial().optional() });
const maxSettingsBytes = 1024 * 1024;

export type TitleConfig = z.output<typeof configSchema>;

function readSettings(path: string): string | undefined {
  const descriptor = openSync(path, "r");

  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size > maxSettingsBytes) return undefined;
    // Read one extra byte so a file that grows after fstat is rejected rather than truncated.
    const data = Buffer.allocUnsafe(stats.size + 1);
    let length = 0;

    while (length < data.length) {
      const count = readSync(descriptor, data, length, data.length - length, null);
      if (count === 0) break;
      length += count;
    }

    return length > stats.size ? undefined : data.toString("utf8", 0, length);
  } finally {
    closeSync(descriptor);
  }
}

function readSection(path: string) {
  try {
    const source = readSettings(path);
    if (source === undefined) return undefined;
    const raw: unknown = JSON.parse(source);
    const parsed = settingsSchema.safeParse(raw);

    return parsed.success ? (parsed.data["ext.pi-session-title"] ?? {}) : undefined;
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
