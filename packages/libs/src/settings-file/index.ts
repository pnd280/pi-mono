export { readSettingsFile } from "./read.ts";

export {
  readScopedSettings,
  settingsPaths,
  type SettingsScope,
  type SettingsScopeOptions
} from "./scopes.ts";

export {
  settingsSection,
  type SettingsSection,
  type SettingsSectionOptions,
  type SettingsSectionValues
} from "./section.ts";

export { readSettingsRecord } from "./transaction.ts";
