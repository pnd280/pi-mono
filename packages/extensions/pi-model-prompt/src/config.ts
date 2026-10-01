import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

export const SETTINGS_KEY = "ext.pi-model-prompt";

const MAX_RULES = 100;
const MAX_PATTERN_LENGTH = 512;
const MAX_FILES_PER_RULE = 32;
const MAX_PATH_LENGTH = 4096;

const ruleSchema = z.strictObject({
  match: z.string().min(1).max(MAX_PATTERN_LENGTH),
  append: z.array(z.string().min(1).max(MAX_PATH_LENGTH)).max(MAX_FILES_PER_RULE).optional()
});

const sectionSchema = z.strictObject({
  rules: z.array(z.unknown()).max(MAX_RULES).optional()
});

export interface ModelRule {
  pattern: RegExp;
  /** Absolute file paths, in append order. */
  append: readonly string[] | undefined;
}

export interface ModelPromptConfig {
  rules: ModelRule[];
  warnings: string[];
}

/**
 * Reads rules from the global settings file only; invalid rules are skipped with a warning.
 * `append` paths expand a leading `~`, then resolve relative to the settings file's directory.
 */
export function loadModelPromptConfig(agentDir: string): ModelPromptConfig {
  const warnings: string[] = [];
  let record: Record<string, unknown>;

  try {
    record = readSettingsRecord(join(agentDir, "settings.json"));
  } catch {
    return { rules: [], warnings: ["settings.json could not be read; rules disabled"] };
  }

  const rawSection = record[SETTINGS_KEY];

  if (rawSection === undefined) return { rules: [], warnings };

  const section = sectionSchema.safeParse(rawSection);

  if (!section.success) {
    return {
      rules: [],
      warnings: [
        `${SETTINGS_KEY} is invalid; expected only rules (at most ${MAX_RULES}); rules disabled`
      ]
    };
  }

  const rules: ModelRule[] = [];
  const home = homedir();

  for (const [index, rawRule] of (section.data.rules ?? []).entries()) {
    const rule = ruleSchema.safeParse(rawRule);

    if (!rule.success) {
      warnings.push(
        `rules[${index}] skipped: invalid rule; check match, append, and unknown fields`
      );
      continue;
    }

    let pattern: RegExp;

    try {
      pattern = new RegExp(rule.data.match);
    } catch {
      warnings.push(`rules[${index}] skipped: invalid regular expression`);
      continue;
    }

    rules.push({
      pattern,
      append: rule.data.append?.map((path) => resolve(agentDir, expandHomePath(path, home)))
    });
  }

  return { rules, warnings };
}

/** The first matching rule that sets a field decides it; later rules may supply other fields. */
export function selectAppendFiles(
  rules: readonly ModelRule[],
  modelKey: string
): readonly string[] | undefined {
  for (const rule of rules) {
    if (rule.append !== undefined && rule.pattern.test(modelKey)) return rule.append;
  }

  return undefined;
}

export function referencedFiles(rules: readonly ModelRule[]): string[] {
  return [...new Set(rules.flatMap((rule) => rule.append ?? []))];
}
