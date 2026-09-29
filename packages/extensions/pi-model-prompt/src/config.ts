import { join } from "node:path";

import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

export const SETTINGS_KEY = "ext.pi-model-prompt";

const MAX_RULES = 100;
const MAX_PATTERN_LENGTH = 512;

/** Variant names become part of a file name, so path separators and dot segments are excluded. */
const variantNameSchema = z.string().regex(/^[\w-]{1,64}$/u);

const ruleSchema = z.strictObject({
  match: z.string().min(1).max(MAX_PATTERN_LENGTH),
  append: variantNameSchema.optional()
});

const sectionSchema = z.strictObject({
  rules: z.array(z.unknown()).max(MAX_RULES).optional()
});

export interface ModelRule {
  pattern: RegExp;
  append: string | undefined;
}

export interface ModelPromptConfig {
  rules: ModelRule[];
  warnings: string[];
}

/** Reads rules from the global settings file only; invalid rules are skipped with a warning. */
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

    rules.push({ pattern, append: rule.data.append });
  }

  return { rules, warnings };
}

/** The first matching rule that sets a field decides it; later rules may supply other fields. */
export function selectAppendVariant(
  rules: readonly ModelRule[],
  modelKey: string
): string | undefined {
  for (const rule of rules) {
    if (rule.append !== undefined && rule.pattern.test(modelKey)) return rule.append;
  }

  return undefined;
}

export function referencedVariants(rules: readonly ModelRule[]): string[] {
  return [...new Set(rules.flatMap((rule) => (rule.append === undefined ? [] : [rule.append])))];
}
