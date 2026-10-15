import { z } from "zod";

import {
  settingsSection,
  type SettingsScopeOptions,
  type SettingsSection
} from "../settings-file/index.ts";

const orderSchema = z
  .array(z.string().min(1).max(200))
  .max(1000)
  .transform((ids) => [...new Set(ids)]);

export type WorkingMessageSettings = SettingsSection<string[]>;

export function workingMessageSettings(options: SettingsScopeOptions): WorkingMessageSettings {
  return settingsSection({
    ...options,
    key: "workingMessage",
    field: "order",
    schema: orderSchema,
    invalidValue: "Cannot save this component order: too many or invalid component ids.",
    loadWarning: (path) =>
      `Cannot load working-message order from ${path}. Check access, syntax, and the 1 MiB regular-file limit.`
  });
}
