import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";

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

/**
 * Read global settings, then project settings only when the project is trusted.
 * The project entry takes precedence; `read` owns parsing, validation, and failure policy.
 */
export function readScopedSettings<T>(
  options: SettingsScopeOptions,
  read: (path: string) => T
): [global: T, project?: T] {
  const paths = settingsPaths(options);
  const global = read(paths.global);

  return options.projectTrusted ? [global, read(paths.project)] : [global];
}
