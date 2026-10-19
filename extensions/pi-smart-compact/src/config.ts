import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import {
  readScopedSettings,
  readSettingsFile,
  readSettingsRecord
} from "@pi-mono/libs/settings-file";
import { modelReferenceSchema, splitModelReference } from "@pi-mono/utils/model-reference";
import { expandHomePath } from "@pi-mono/utils/paths";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
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
  compactionInstructionsFile: z.string().trim().min(1).optional(),
  docs: z.array(z.string().trim().min(1)).optional()
});
const settingsSchema = z.object({ "ext.pi-smart-compact": configSchema.optional() });

/** The `ext.pi-smart-compact` settings JSON. */
export type CompactSettings = z.input<typeof configSchema>;

type ParsedSettings = z.output<typeof configSchema>;

export type CompactConfig = Omit<ParsedSettings, "compactionInstructionsFile" | "docs"> & {
  instructions?: string;
};

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
      // Relative paths belong to the scope that names them.
      const scoped = (entry: string) => resolve(dirname(path), expandHomePath(entry, homedir()));
      if (config.compactionInstructionsFile !== undefined)
        config.compactionInstructionsFile = scoped(config.compactionInstructionsFile);
      if (config.docs !== undefined) config.docs = config.docs.map(scoped);

      return config;
    }
  } catch {
    // Report only the redacted settings error below.
  }

  throw new Error(
    "pi-smart-compact: invalid or unreadable settings. Check ext.pi-smart-compact in global and trusted project settings.json, then /reload."
  );
}

/** Read a selected text file, trimmed; `setting` names it in the error. */
function readTextFile(path: string, setting: "compactionInstructionsFile" | "docs") {
  try {
    const text = readSettingsFile(path);
    if (text !== undefined) return text.trim();
  } catch {
    // Do not expose file contents or silently ignore configured text.
  }

  throw new Error(
    `pi-smart-compact: invalid or unreadable file (expected a UTF-8 text file up to 1 MiB). Check ext.pi-smart-compact.${setting}, then /reload.`
  );
}

/**
 * Only absent fields inherit; invalid settings must not silently select another model.
 * `docs` joins the selected files for the `context_window` description and is absent when unset.
 */
export function loadCompactConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): CompactConfig & { docs?: string } {
  const [global, project] = readScopedSettings({ cwd, projectTrusted, agentDir }, readSection);
  const { compactionInstructionsFile, docs, ...config } = { ...global, ...project };

  return {
    ...config,
    ...(compactionInstructionsFile !== undefined && {
      instructions: readTextFile(compactionInstructionsFile, "compactionInstructionsFile")
    }),
    ...(docs !== undefined && {
      docs: docs
        .map((path) => readTextFile(path, "docs"))
        .filter(Boolean)
        .join("\n\n")
    })
  };
}
