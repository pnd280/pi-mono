import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  isSettingsRecord,
  readSettingsRecord,
  updateSettingsRecord
} from "@pi-mono/libs/settings-file";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { z } from "zod";

import { layoutSchema, type Layout } from "./layout.ts";

const key = "ext.pi-editor-widgets";
const sectionSchema = z.object({ layout: layoutSchema.optional() }).passthrough();

export type Scope = "global" | "project";

export type Preferences = Record<Scope, Layout | undefined> & { warnings: string[] };

export class WidgetSettings {
  readonly paths: Record<Scope, string>;

  constructor(readonly options: { cwd: string; projectTrusted: boolean; agentDir?: string }) {
    this.paths = {
      global: join(options.agentDir ?? getAgentDir(), "settings.json"),
      project: join(options.cwd, CONFIG_DIR_NAME, "settings.json")
    };
  }

  load(): Preferences {
    const warnings: string[] = [];

    const loadScope = (scope: Scope): Layout | undefined => {
      try {
        const record = readSettingsRecord(this.paths[scope]);

        return sectionSchema.parse(record[key] === undefined ? {} : record[key]).layout;
      } catch {
        warnings.push(
          `pi-editor-widgets: invalid or unreadable settings at ${compactDisplayText(this.paths[scope])}. Check JSON, unique widget IDs, one flex per row, and the 1 MiB limit. Falling back to the next scope.`
        );

        return undefined;
      }
    };

    return {
      global: loadScope("global"),
      project: this.options.projectTrusted ? loadScope("project") : undefined,
      warnings
    };
  }

  save(scope: Scope, layout: Layout | undefined): void {
    if (scope === "project" && !this.options.projectTrusted)
      throw new Error("Trust this project before saving project settings.");

    try {
      const parsed = layout === undefined ? undefined : layoutSchema.parse(layout);
      updateSettingsRecord(this.paths[scope], (record) => {
        // A valid JSON object may contain an invalid old layout: replace only that preference.
        // Reject malformed sections instead of discarding unrelated data to repair them.
        const section = record[key] === undefined ? {} : record[key];
        if (!isSettingsRecord(section)) throw new Error("Settings section must be an object.");
        if (parsed === undefined) delete section.layout;
        else section.layout = parsed;
        record[key] = section;
      });
    } catch {
      throw new Error(
        `Check access, JSON, size and locks.\nFile: ${compactDisplayText(this.paths[scope])}`
      );
    }
  }
}
