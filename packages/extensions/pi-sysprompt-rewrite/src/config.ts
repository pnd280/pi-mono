import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readScopedSections,
  type ScopedSection,
  type SettingsScope,
  type SettingsScopeOptions
} from "@pi-mono/libs/settings-file";
import { z } from "zod";

import { parseRules, type RewriteRule } from "./rules.ts";

const SETTINGS_KEY = "ext.pi-sysprompt-rewrite";
const DEFAULT_DOCS_FILE_NAME = "pi-docs.md";

const settingsSchema = z.strictObject({
  rules: z.unknown().optional(),
  piDocsCollapse: z.unknown().optional()
});

const docsCollapseSchema = z.strictObject({
  enabled: z.boolean().optional(),
  // A bare name keeps a project-supplied value inside the temporary directory.
  fileName: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,128}\.md$/)
    .optional()
});

type DocsCollapseSettings = z.output<typeof docsCollapseSchema>;

export type RewriteConfig = {
  rules: readonly RewriteRule[];
  /** The absolute path of the docs file, or `undefined` when the collapse is off. */
  docsFile: string | undefined;
  warnings: string[];
};

/**
 * Reads `rules` from global settings only, because rules rewrite the system prompt freely. `piDocsCollapse` also reads trusted project settings, field by field over the global value; any unreadable or invalid scope turns it off. Warnings never echo supplied keys or values.
 */
export function loadRewriteConfig(options: SettingsScopeOptions): RewriteConfig {
  const [global, project] = readScopedSections(options, SETTINGS_KEY);
  const warnings: string[] = [];

  const globalSettings = readScope(global, "rules and piDocsCollapse", warnings);
  const { rules, warnings: ruleWarnings } = parseRules(globalSettings?.rules);

  warnings.push(...ruleWarnings);

  const globalCollapse =
    globalSettings && parseDocsCollapse("global", globalSettings.piDocsCollapse, warnings);
  // Untrusted projects contribute nothing; a trusted project's `rules` are ignored.
  let projectCollapse: DocsCollapseSettings | undefined = {};

  if (project) {
    const projectSettings = readScope(project, "piDocsCollapse", warnings);

    projectCollapse =
      projectSettings && parseDocsCollapse("project", projectSettings.piDocsCollapse, warnings);
  }

  if (!globalCollapse || !projectCollapse) return { rules, docsFile: undefined, warnings };

  const enabled = projectCollapse.enabled ?? globalCollapse.enabled ?? false;
  const fileName = projectCollapse.fileName ?? globalCollapse.fileName ?? DEFAULT_DOCS_FILE_NAME;

  return {
    rules,
    docsFile: enabled ? join(tmpdir(), fileName) : undefined,
    warnings
  };
}

function readScope(
  section: ScopedSection,
  disabled: string,
  warnings: string[]
): z.output<typeof settingsSchema> | undefined {
  if (section.status === "unreadable") {
    warnings.push(`${section.scope} settings.json could not be read; ${disabled} disabled`);

    return undefined;
  }

  if (section.value === undefined) return {};

  const settings = settingsSchema.safeParse(section.value);

  if (!settings.success) {
    warnings.push(
      `${SETTINGS_KEY} in ${section.scope} settings is invalid; expected only rules and piDocsCollapse; ${disabled} disabled`
    );

    return undefined;
  }

  return settings.data;
}

function parseDocsCollapse(
  scope: SettingsScope,
  value: unknown,
  warnings: string[]
): DocsCollapseSettings | undefined {
  if (value === undefined) return {};

  const parsed = docsCollapseSchema.safeParse(value);

  if (!parsed.success) {
    warnings.push(
      `piDocsCollapse in ${scope} settings is invalid; expected enabled and a bare .md fileName; piDocsCollapse disabled`
    );

    return undefined;
  }

  return parsed.data;
}
