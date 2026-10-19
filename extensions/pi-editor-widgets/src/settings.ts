import {
  settingsSection,
  type SettingsScopeOptions,
  type SettingsSection,
  type SettingsSectionValues
} from "@pi-mono/libs/settings-file";

import { layoutSchema, type Layout } from "./layout.ts";

export type Preferences = SettingsSectionValues<Layout>;

export type WidgetSettings = SettingsSection<Layout>;

export function widgetSettings(options: SettingsScopeOptions): WidgetSettings {
  return settingsSection({
    ...options,
    key: "ext.pi-editor-widgets",
    field: "layout",
    schema: layoutSchema,
    invalidValue: "Cannot save this layout: too many or invalid entries.",
    loadWarning: (path) =>
      `pi-editor-widgets: cannot load layout settings from ${path}. Check access, syntax, and the 1 MiB regular-file limit. Layout IDs must be unique per row and in hidden, hidden IDs cannot be placed, and a row has at most one flex. Falling back to the next scope.`
  });
}
