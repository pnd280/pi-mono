import { join } from "node:path";

import { readSettingsFile } from "@pi-mono/libs/settings-file";
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
const globalSettingsSchema = z.object({ "ext.pi-prompt-manager": z.unknown().optional() });
const missingFileSchema = z.object({ code: z.literal("ENOENT") });

export type Settings = z.output<typeof settingsSchema>;

export function parseSettings(value: unknown): { settings: Settings; warnings: string[] } {
  const result = settingsSchema.safeParse(value === undefined ? {} : value);
  const warnings: string[] = [];
  if (result.success) return resolveShortcuts(result.data, warnings);

  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys")
      warnings.push("Unknown pi-prompt-manager settings fields were ignored.");
    else if (!issue.path.length)
      warnings.push("Invalid pi-prompt-manager settings section; using defaults.");
    else if (issue.path[0] === "historyRetention")
      warnings.push("Invalid historyRetention; using 250.");
    else if (issue.path.length === 1) warnings.push("Invalid shortcuts object; using defaults.");
  }

  // Recover fields independently; a bad action must not reset another action's bindings.
  const section = objectSchema.safeParse(value).data ?? {};
  const shortcuts = objectSchema.safeParse(section.shortcuts).data ?? {};
  const historyRetention =
    settingsSchema.shape.historyRetention.safeParse(section.historyRetention).data ?? 250;

  const bindings = (action: "history" | "saveDraft") => {
    const parsed = shortcutsSchema.shape[action].safeParse(shortcuts[action]);
    if (parsed.success) return parsed.data;
    warnings.push("Invalid launch shortcut list; using that action's default.");

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
    warnings.push(`History owns launch shortcut ${key}; it will not save drafts.`);

    return false;
  });

  return { settings, warnings };
}

/** The caller must establish TUI mode before calling this global-only reader. */
export async function loadSettings(agentDir: string) {
  try {
    const content = readSettingsFile(join(agentDir, "settings.json"));
    if (content === undefined) throw new Error("Invalid settings file.");
    if (content === "") return parseSettings(undefined);
    const raw: unknown = JSON.parse(content.startsWith("\uFEFF") ? content.slice(1) : content);
    const parsed = globalSettingsSchema.safeParse(raw);

    return parseSettings(parsed.success ? parsed.data["ext.pi-prompt-manager"] : null);
  } catch (error) {
    const result = parseSettings(undefined);

    if (!missingFileSchema.safeParse(error).success)
      result.warnings.push("Global settings could not be read; using prompt-manager defaults.");

    return result;
  }
}
