import { z } from "zod";

import {
  isSettingsRecord,
  readSettingsRecord,
  settingsPaths,
  updateSettingsRecord,
  type SettingsScope,
  type SettingsScopeOptions
} from "../settings-file/index.ts";
import { compactDisplayText } from "../tui/terminal-text/index.ts";

const orderSchema = z
  .array(z.string().min(1).max(200))
  .max(1000)
  .transform((ids) => [...new Set(ids)]);
const sectionSchema = z.object({ order: orderSchema.optional() }).passthrough();

export type WorkingMessageScope = SettingsScope;

export type WorkingMessagePreferences = {
  global: string[] | undefined;
  project: string[] | undefined;
  warnings: string[];
};

function readSection(record: Record<string, unknown>) {
  const parsed = sectionSchema.safeParse(
    record.workingMessage === undefined ? {} : record.workingMessage
  );
  if (!parsed.success)
    throw new Error("Invalid workingMessage settings. Expected an order array of component ids.");

  return parsed.data;
}

export class WorkingMessageSettings {
  readonly paths: Record<WorkingMessageScope, string>;

  constructor(private readonly options: SettingsScopeOptions) {
    this.paths = settingsPaths(options);
  }

  load(): WorkingMessagePreferences {
    const warnings: string[] = [];

    const readOrder = (scope: WorkingMessageScope) => {
      try {
        return readSection(readSettingsRecord(this.paths[scope])).order;
      } catch {
        warnings.push(
          `Cannot load working-message order from ${compactDisplayText(this.paths[scope])}. Check access, syntax, and the 1 MiB regular-file limit.`
        );

        return undefined;
      }
    };

    const global = readOrder("global");
    const project = this.options.projectTrusted ? readOrder("project") : undefined;

    return { global, project, warnings };
  }

  save(scope: WorkingMessageScope, order: readonly string[]): void {
    if (scope === "project" && !this.options.projectTrusted)
      throw new Error("Trust this project before saving project settings.");
    const parsed = orderSchema.safeParse(order);
    if (!parsed.success)
      throw new Error("Cannot save this component order: too many or invalid component ids.");
    const path = this.paths[scope];

    try {
      updateSettingsRecord(path, (record) => {
        // Replace only the owned preference, including an invalid old order.
        const section = record.workingMessage === undefined ? {} : record.workingMessage;
        if (!isSettingsRecord(section)) throw new Error("Settings section must be an object.");
        record.workingMessage = { ...section, order: parsed.data };
      });
    } catch {
      throw new Error(`Check access, JSON, size and locks.\nFile: ${compactDisplayText(path)}`);
    }
  }
}
