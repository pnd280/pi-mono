import { join } from "node:path";

import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { z } from "zod";

const SETTINGS_KEY = "ext.pi-sysprompt-rewrite";

const MAX_RULES = 100;
const MAX_TEXT_LENGTH = 4096;

const ruleSchema = z.strictObject({
  match: z.string().min(1).max(MAX_TEXT_LENGTH),
  flags: z
    .string()
    .regex(/^[imsu]*$/)
    .optional(),
  replace: z.string().max(MAX_TEXT_LENGTH),
  sections: z.array(z.string().min(1).max(MAX_TEXT_LENGTH)).max(MAX_RULES).optional()
});

const settingsSchema = z.strictObject({
  rules: z.array(z.unknown()).max(MAX_RULES).optional()
});

type RewriteRule = {
  pattern: RegExp;
  replace: string;
  /** `undefined` applies the rule to every section. */
  sections: ReadonlySet<string> | undefined;
};

export type RewriteConfig = {
  rules: readonly RewriteRule[];
  warnings: string[];
};

/**
 * Reads rules from the global settings file only, because rules rewrite the system prompt. Invalid rules are skipped; warnings never echo supplied keys or values.
 */
export function loadRewriteConfig(agentDir: string): RewriteConfig {
  let record: Record<string, unknown>;

  try {
    record = readSettingsRecord(join(agentDir, "settings.json"));
  } catch {
    return { rules: [], warnings: ["settings.json could not be read; rules disabled"] };
  }

  const rawSettings = record[SETTINGS_KEY];

  if (rawSettings === undefined) return { rules: [], warnings: [] };

  const settings = settingsSchema.safeParse(rawSettings);

  if (!settings.success) {
    return {
      rules: [],
      warnings: [
        `${SETTINGS_KEY} is invalid; expected only rules (at most ${MAX_RULES}); rules disabled`
      ]
    };
  }

  const rules: RewriteRule[] = [];
  const warnings: string[] = [];

  for (const [index, rawRule] of (settings.data.rules ?? []).entries()) {
    const rule = ruleSchema.safeParse(rawRule);

    if (!rule.success) {
      warnings.push(
        `rules[${index}] skipped: invalid rule; check match, flags, replace, sections, and unknown fields`
      );
      continue;
    }

    let pattern: RegExp;

    try {
      pattern = new RegExp(rule.data.match, `${rule.data.flags ?? ""}g`);
    } catch {
      warnings.push(`rules[${index}] skipped: invalid regular expression or flags`);
      continue;
    }

    rules.push({
      pattern,
      replace: rule.data.replace,
      sections: rule.data.sections && new Set(rule.data.sections)
    });
  }

  return { rules, warnings };
}

/**
 * Runs the rules that apply to section `name` in list order. Rules see only the body inside Pi's `<name>` wrapper, which is kept as is; a section without that exact wrapper, such as `preamble`, is rewritten whole.
 */
export function rewriteSection(
  rules: readonly RewriteRule[],
  name: string,
  content: string
): string {
  const open = `<${name}>\n`;
  const close = `\n</${name}>`;
  const wrapped = content.startsWith(open) && content.endsWith(close);
  let body = wrapped ? content.slice(open.length, -close.length) : content;

  for (const rule of rules) {
    if (rule.sections && !rule.sections.has(name)) continue;
    body = body.replace(rule.pattern, rule.replace);
  }

  return wrapped ? `${open}${body}${close}` : body;
}
