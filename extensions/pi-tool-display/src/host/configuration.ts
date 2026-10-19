import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { settingsPaths } from "@pi-mono/libs/settings-file";

import { loadDisplaySettings, type DisplaySettings } from "../settings.ts";
import { record } from "../values.ts";

/** Storage paths are private host diagnostics; settings values use Pi's public manager. */
export function displaySettings(session: AgentSession): DisplaySettings {
  const manager = session.settingsManager;
  const storage = record(record(manager).storage);
  const paths = settingsPaths({ cwd: session.sessionManager.getCwd() });

  return loadDisplaySettings([
    {
      path:
        typeof storage.globalSettingsPath === "string" ? storage.globalSettingsPath : paths.global,
      settings: manager.getGlobalSettings()
    },
    ...(manager.isProjectTrusted()
      ? [
          {
            path:
              typeof storage.projectSettingsPath === "string"
                ? storage.projectSettingsPath
                : paths.project,
            settings: manager.getProjectSettings()
          }
        ]
      : [])
  ]);
}
