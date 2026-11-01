import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

import { readSettingsRecord } from "./transaction.ts";

export type SettingsScope = "global" | "project";

export type SettingsScopeOptions = {
  cwd: string;
  projectTrusted: boolean;
  /** Defaults to Pi's agent directory. */
  agentDir?: string | undefined;
};

/** Pi's global settings and the current directory's project settings; parent directories never apply. */
export function settingsPaths({
  cwd,
  agentDir = getAgentDir()
}: Omit<SettingsScopeOptions, "projectTrusted">): Record<SettingsScope, string> {
  return {
    global: join(agentDir, "settings.json"),
    project: join(cwd, CONFIG_DIR_NAME, "settings.json")
  };
}

/** One scope's value of a top-level settings key, unvalidated. */
export type ScopedSection = { scope: SettingsScope; path: string } & (
  | { status: "read"; value: unknown }
  | { status: "unreadable" }
);

/**
 * Read `key` from global settings, then from project settings only when the project is trusted.
 * A missing file or key reads as `undefined`. Callers own validation, failure policy, and how the
 * project entry overrides the global one.
 */
export function readScopedSections(
  options: SettingsScopeOptions,
  key: string
): [global: ScopedSection] | [global: ScopedSection, project: ScopedSection] {
  const paths = settingsPaths(options);

  const read = (scope: SettingsScope): ScopedSection => {
    const path = paths[scope];

    try {
      return { scope, path, status: "read", value: readSettingsRecord(path)[key] };
    } catch {
      return { scope, path, status: "unreadable" };
    }
  };

  const global = read("global");

  return options.projectTrusted ? [global, read("project")] : [global];
}
