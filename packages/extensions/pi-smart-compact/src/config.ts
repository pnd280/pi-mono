import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { MODEL_THINKING_LEVELS } from "@earendil-works/pi-ai/providers/model-schema";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  readScopedSettings,
  readSettingsFile,
  readSettingsRecord
} from "@pi-mono/libs/settings-file";
import { modelReferenceSchema, splitModelReference } from "@pi-mono/utils/model-reference";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

export const thinkingLevelSchema = z.enum(MODEL_THINKING_LEVELS);

const ruleSchema = z.strictObject({
  match: z.string().transform((source, ctx) => {
    try {
      return new RegExp(source);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid regular expression." });

      return z.NEVER;
    }
  }),
  model: modelReferenceSchema.optional(),
  thinkingLevel: thinkingLevelSchema.optional()
});

const configSchema = z.strictObject({
  rules: z.array(ruleSchema).optional(),
  applyToManual: z.boolean().optional(),
  applyToAuto: z.boolean().optional(),
  instructionsFile: z.string().trim().min(1).optional()
});
const settingsSchema = z.object({ "ext.pi-smart-compact": configSchema.optional() });

/** The `ext.pi-smart-compact` settings JSON. */
export type CompactSettings = z.input<typeof configSchema>;

type ParsedSettings = z.output<typeof configSchema>;

export type CompactConfig = Omit<ParsedSettings, "instructionsFile"> & { instructions?: string };

/** The first rule matching `provider/id` decides both fields; no match keeps native selection. */
export function selectRule(
  config: Pick<CompactConfig, "rules">,
  model: { provider: string; id: string }
) {
  return config.rules?.find((rule) => rule.match.test(`${model.provider}/${model.id}`));
}

/** Resolve a validated `provider/model-id` reference; the model ID may contain slashes. */
export function findConfiguredModel(registry: Pick<ModelRegistry, "find">, reference: string) {
  const { provider, id } = splitModelReference(reference);

  return registry.find(provider, id);
}

function readSection(path: string): ParsedSettings {
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
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): CompactConfig {
  const [global, project] = readScopedSettings({ cwd, projectTrusted, agentDir }, readSection);

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
