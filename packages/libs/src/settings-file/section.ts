import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { z } from "zod";

import { compactDisplayText } from "../tui/terminal-text/index.ts";
import {
  readScopedSections,
  settingsPaths,
  type SettingsScope,
  type SettingsScopeOptions
} from "./scopes.ts";
import { isSettingsRecord, updateSettingsRecord } from "./transaction.ts";

export type SettingsSectionOptions<Value> = SettingsScopeOptions & {
  /** Top-level settings key holding the section object, such as `ext.<package>`. */
  key: string;
  /** The one section field that loads read and saves replace. */
  field: string;
  schema: z.ZodType<Value>;
  /** Error message for a save whose value the schema rejects. */
  invalidValue: string;
  /** Warning for an unreadable file, malformed section, or invalid field at a display-safe path. */
  loadWarning(path: string): string;
};

export type SettingsSectionValues<Value> = Record<SettingsScope, Value | undefined> & {
  warnings: string[];
};

export type SettingsSection<Value> = {
  readonly paths: Record<SettingsScope, string>;
  readonly projectTrusted: boolean;
  load(): SettingsSectionValues<Value>;
  save(scope: SettingsScope, value: Readonly<Value>): void;
};

/** One field of a settings section in the global and trusted project scopes. Loads never write. */
export function settingsSection<Value>(
  options: SettingsSectionOptions<Value>
): SettingsSection<Value> {
  const { key, field, schema, projectTrusted } = options;
  // Resolve Pi's agent directory once, so loads read the files that `paths` names and saves replace.
  const scopes = { cwd: options.cwd, projectTrusted, agentDir: options.agentDir ?? getAgentDir() };
  const paths = settingsPaths(scopes);

  return {
    paths,
    projectTrusted,

    load() {
      const values: SettingsSectionValues<Value> = {
        global: undefined,
        project: undefined,
        warnings: []
      };

      for (const scoped of readScopedSections(scopes, key)) {
        // A missing section loads as undefined; an unreadable file warns like a malformed section.
        if (scoped.status === "read" && scoped.value === undefined) continue;
        const parsed =
          scoped.status === "read" && isSettingsRecord(scoped.value)
            ? schema.optional().safeParse(scoped.value[field])
            : undefined;
        if (parsed?.success) values[scoped.scope] = parsed.data;
        else values.warnings.push(options.loadWarning(compactDisplayText(scoped.path)));
      }

      return values;
    },

    save(scope, value) {
      if (scope === "project" && !projectTrusted)
        throw new Error("Trust this project before saving project settings.");
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw new Error(options.invalidValue);
      const path = paths[scope];

      try {
        updateSettingsRecord(path, (record) => {
          // Replace only the owned field, including an invalid old value. Reject malformed
          // sections instead of discarding unrelated data to repair them.
          const section = record[key] === undefined ? {} : record[key];
          if (!isSettingsRecord(section)) throw new Error("Settings section must be an object.");
          record[key] = { ...section, [field]: parsed.data };
        });
      } catch {
        throw new Error(`Check access, JSON, size and locks.\nFile: ${compactDisplayText(path)}`);
      }
    }
  };
}
