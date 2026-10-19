import { join } from "node:path";

import { readSettingsRecord } from "@pi-mono/libs/settings-file";
import { canonicalKeySchema } from "@pi-mono/libs/tui/keybindings";
import { z } from "zod";

const objectSchema = z.looseObject({});
const shortcutListSchema = z.array(canonicalKeySchema).transform((keys) => [...new Set(keys)]);
const shortcutsSchema = z.strictObject({
  history: shortcutListSchema.default(["ctrl+r"]),
  saveDraft: shortcutListSchema.default(["ctrl+shift+s"])
});
const settingsSchema = z.strictObject({
  historyRetention: z
    .number()
    .transform((value) => Math.max(1, Math.min(5000, Math.floor(value))))
    .default(250),
  shortcuts: shortcutsSchema.prefault({})
});

export type Settings = z.output<typeof settingsSchema>;

function parseSettings(value: unknown): { settings: Settings; warnings: string[] } {
  const result = settingsSchema.safeParse(value === undefined ? {} : value);
  const warnings: string[] = [];
  if (result.success) return resolveShortcuts(result.data, warnings);

  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys") warnings.push("unknown settings fields were ignored.");
    else if (!issue.path.length) warnings.push("invalid settings section; using defaults.");
    else if (issue.path[0] === "historyRetention")
      warnings.push("invalid historyRetention; using 250.");
    else if (issue.path.length === 1) warnings.push("invalid shortcuts object; using defaults.");
  }

  // Recover fields independently; a bad action must not reset another action's bindings.
  const section = objectSchema.safeParse(value).data ?? {};
  const shortcuts = objectSchema.safeParse(section.shortcuts).data ?? {};
  const historyRetention =
    settingsSchema.shape.historyRetention.safeParse(section.historyRetention).data ?? 250;

  const bindings = (action: "history" | "saveDraft") => {
    const parsed = shortcutsSchema.shape[action].safeParse(shortcuts[action]);
    if (parsed.success) return parsed.data;
    warnings.push("invalid launch shortcut list; using that action's default.");

    return shortcutsSchema.shape[action].parse(undefined);
  };

  return resolveShortcuts(
    {
      historyRetention,
      shortcuts: { history: bindings("history"), saveDraft: bindings("saveDraft") }
    },
    warnings
  );
}

function resolveShortcuts(settings: Settings, warnings: string[]) {
  settings.shortcuts.saveDraft = settings.shortcuts.saveDraft.filter((key) => {
    if (!settings.shortcuts.history.includes(key)) return true;
    warnings.push(`history owns launch shortcut ${key}; it will not save drafts.`);

    return false;
  });

  return { settings, warnings };
}

/** The caller must establish TUI mode before calling this global-only reader. */
export async function loadSettings(agentDir: string) {
  let raw: Record<string, unknown>;

  try {
    raw = readSettingsRecord(join(agentDir, "settings.json"));
  } catch {
    const result = parseSettings(undefined);
    result.warnings.push("global settings could not be read; using defaults.");

    return result;
  }

  return parseSettings(raw["ext.pi-prompt-manager"]);
}
