import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir, type AgentSession } from "@earendil-works/pi-coding-agent";

import { loadDisplaySettings, type DisplaySettings } from "../settings.ts";
import { record } from "../values.ts";

/** Storage paths are private host diagnostics; settings values use Pi's public manager. */
export function displaySettings(session: AgentSession): DisplaySettings {
  const manager = session.settingsManager;
  const storage = record(record(manager).storage);

  return loadDisplaySettings([
    {
      path:
        typeof storage.globalSettingsPath === "string"
          ? storage.globalSettingsPath
          : join(getAgentDir(), "settings.json"),
      settings: manager.getGlobalSettings()
    },
    ...(manager.isProjectTrusted()
      ? [
          {
            path:
              typeof storage.projectSettingsPath === "string"
                ? storage.projectSettingsPath
                : join(session.sessionManager.getCwd(), CONFIG_DIR_NAME, "settings.json"),
            settings: manager.getProjectSettings()
          }
        ]
      : [])
  ]);
}
