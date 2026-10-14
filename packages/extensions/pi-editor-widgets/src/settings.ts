import {
  isSettingsRecord,
  readSettingsRecord,
  settingsPaths,
  updateSettingsRecord,
  type SettingsScope
} from "@pi-mono/libs/settings-file";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import { layoutSchema, type Layout } from "./layout.ts";

const key = "ext.pi-editor-widgets";
const thresholdSchema = z.number().int().positive();

export type Scope = SettingsScope;

export type Preferences = Record<Scope, Layout | undefined> & {
  /** Context token budget resolved per field: project value, then global. */
  contextThreshold?: number;
  warnings: string[];
};

type ScopePreferences = { layout?: Layout | undefined; contextThreshold?: number | undefined };

export class WidgetSettings {
  readonly paths: Record<Scope, string>;
  readonly projectTrusted: boolean;

  constructor(options: { cwd: string; projectTrusted: boolean; agentDir?: string }) {
    this.projectTrusted = options.projectTrusted;
    this.paths = settingsPaths(options);
  }

  load(): Preferences {
    const warnings: string[] = [];

    const loadScope = (scope: Scope): ScopePreferences => {
      const path = compactDisplayText(this.paths[scope]);
      const invalid = () =>
        warnings.push(
          `pi-editor-widgets: cannot load layout settings from ${path}. Check access, syntax, and the 1 MiB regular-file limit. Layout IDs must be unique per row and in hidden, hidden IDs cannot be placed, and a row has at most one flex. Falling back to the next scope.`
        );
      let section: unknown;

      try {
        const record = readSettingsRecord(this.paths[scope]);
        section = record[key] === undefined ? {} : record[key];
      } catch {
        invalid();

        return {};
      }

      if (!isSettingsRecord(section)) {
        invalid();

        return {};
      }

      // Preferences fall back independently: an invalid threshold keeps a valid layout.
      const layout = layoutSchema.optional().safeParse(section.layout);
      if (!layout.success) invalid();
      const threshold = thresholdSchema.optional().safeParse(section.contextThreshold);
      if (!threshold.success)
        warnings.push(
          `pi-editor-widgets: contextThreshold at ${path} must be a positive integer. Falling back to the next scope.`
        );

      return {
        layout: layout.success ? layout.data : undefined,
        contextThreshold: threshold.success ? threshold.data : undefined
      };
    };

    const global = loadScope("global");
    const project = this.projectTrusted ? loadScope("project") : {};
    const contextThreshold = project.contextThreshold ?? global.contextThreshold;

    return {
      global: global.layout,
      project: project.layout,
      ...(contextThreshold === undefined ? {} : { contextThreshold }),
      warnings
    };
  }

  save(scope: Scope, layout: Layout): void {
    if (scope === "project" && !this.projectTrusted)
      throw new Error("Trust this project before saving project settings.");

    try {
      const parsed = layoutSchema.parse(layout);
      updateSettingsRecord(this.paths[scope], (record) => {
        // A valid JSON object may contain an invalid old layout: replace only that preference.
        // Reject malformed sections instead of discarding unrelated data to repair them.
        const section = record[key] === undefined ? {} : record[key];
        if (!isSettingsRecord(section)) throw new Error("Settings section must be an object.");
        section.layout = parsed;
        record[key] = section;
      });
    } catch {
      throw new Error(
        `Check access, JSON, size and locks.\nFile: ${compactDisplayText(this.paths[scope])}`
      );
    }
  }
}
