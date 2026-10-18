import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import { MODEL_THINKING_LEVELS } from "@earendil-works/pi-ai/providers/model-schema";
import {
  readScopedSettings,
  readSettingsFile,
  readSettingsRecord,
  type SettingsScopeOptions
} from "@pi-mono/libs/settings-file";
import { canonicalKeySchema } from "@pi-mono/libs/tui/keybindings";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

const SETTINGS_KEY = "ext.pi-profiles";
const DEFAULT_SHORTCUT = "alt+i";

/** `/profile clear` selects no profile, so no profile can have this name. */
export const CLEAR = "clear";

const MAX_PROFILES = 100;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_PROMPTS = 32;
const MAX_TOOLS = 256;
const MAX_TOOL_NAME_LENGTH = 256;

/** A tool name, or a pattern where `*` matches any characters. */
const toolNameSchema = z.string().min(1).max(MAX_TOOL_NAME_LENGTH);
const toolListSchema = z.array(toolNameSchema).max(MAX_TOOLS);

const profileSchema = z.strictObject({
  // One printable word, so `/profile <name>` and notices need no quoting or sanitising.
  name: z
    .string()
    .max(MAX_NAME_LENGTH)
    .regex(/^[^\s\p{C}]+$/u),
  description: z.string().max(MAX_DESCRIPTION_LENGTH),
  model: modelReferenceSchema.optional(),
  thinking: z.enum(MODEL_THINKING_LEVELS).optional(),
  // File paths, which resolve from the directory of the settings file that names them.
  appendSystemPrompts: z.array(z.string().min(1)).max(MAX_PROMPTS).optional(),
  tools: z
    .strictObject({
      allow: toolListSchema.optional(),
      deny: toolListSchema.optional(),
      // An array is a group, whose deferred tools load together.
      defer: z
        .array(z.union([toolNameSchema, toolListSchema.min(1)]))
        .max(MAX_TOOLS)
        .optional()
    })
    .optional()
});

const sectionSchema = z.looseObject({
  profiles: z.array(z.unknown()).max(MAX_PROFILES).optional(),
  defaultProfile: z.string().optional(),
  shortcut: canonicalKeySchema.optional()
});

export type Profile = Omit<z.output<typeof profileSchema>, "appendSystemPrompts"> & {
  /** The non-empty texts of the `appendSystemPrompts` files, read when settings load. */
  prompts: string[];
};

/** The trimmed texts of the files, or the index of the first file that cannot be read. */
function readPrompts(paths: readonly string[], settingsPath: string): string[] | number {
  const texts: string[] = [];

  for (const [index, path] of paths.entries()) {
    let text: string | undefined;

    try {
      text = readSettingsFile(resolve(dirname(settingsPath), expandHomePath(path, homedir())));
    } catch {
      // Reported by the caller without the path.
    }

    if (text === undefined) return index;
    // `trim` also removes a byte order mark.
    if (text.trim()) texts.push(text.trim());
  }

  return texts;
}

type Shortcut = z.output<typeof canonicalKeySchema>;

export interface ProfileConfig {
  /**
   * Valid global profiles in declaration order, each replaced in place by the project profile with
   * its name, then the other project profiles. The shortcut cycles through them in this order.
   */
  profiles: Profile[];
  defaultProfile: Profile | undefined;
  shortcut: Shortcut;
  warnings: string[];
}

/** One file's section. Each field recovers on its own. */
interface Section {
  profiles: Profile[];
  /** The supplied value, which the merged profiles resolve. */
  defaultProfile: unknown;
  shortcut: Shortcut | undefined;
  warnings: string[];
}

function readSection(path: string): Section {
  const section: Section = {
    profiles: [],
    defaultProfile: undefined,
    shortcut: undefined,
    warnings: []
  };
  let raw: unknown;

  try {
    raw = readSettingsRecord(path)[SETTINGS_KEY];
  } catch {
    section.warnings.push("settings.json could not be read; its profiles were ignored");

    return section;
  }

  if (raw === undefined) return section;
  const parsed = z.record(z.string(), z.unknown()).safeParse(raw);

  if (!parsed.success) {
    section.warnings.push(`${SETTINGS_KEY} is not an object and was ignored`);

    return section;
  }

  const fields = sectionSchema.shape;
  const known = new Set(Object.keys(fields));

  if (Object.keys(parsed.data).some((key) => !known.has(key)))
    section.warnings.push(`${SETTINGS_KEY} has unknown fields; they were ignored`);

  const profiles = fields.profiles.safeParse(parsed.data.profiles);
  if (!profiles.success)
    section.warnings.push(`profiles is invalid; expected at most ${MAX_PROFILES} entries`);

  for (const [index, rawProfile] of (profiles.data ?? []).entries()) {
    const profile = profileSchema.safeParse(rawProfile);

    if (!profile.success) {
      section.warnings.push(`profiles[${index}] skipped: invalid profile; check its fields`);
    } else if (profile.data.name === CLEAR) {
      section.warnings.push(`profiles[${index}] skipped: the name ${CLEAR} is reserved`);
    } else if (section.profiles.some(({ name }) => name === profile.data.name)) {
      section.warnings.push(`profiles[${index}] skipped: duplicate name`);
    } else {
      const { appendSystemPrompts = [], ...rest } = profile.data;
      const prompts = readPrompts(appendSystemPrompts, path);

      if (typeof prompts === "number")
        section.warnings.push(
          `profiles[${index}] skipped: appendSystemPrompts[${prompts}] could not be read`
        );
      else section.profiles.push({ ...rest, prompts });
    }
  }

  const shortcut = fields.shortcut.safeParse(parsed.data.shortcut);
  if (shortcut.success) section.shortcut = shortcut.data;
  else section.warnings.push("shortcut is invalid and was ignored");

  section.defaultProfile = parsed.data.defaultProfile;

  return section;
}

/**
 * Reads global settings, and project settings only in a trusted project, because profiles choose
 * tools and system prompt text. Project values take precedence. Warnings name the file's scope,
 * but never repeat supplied keys or values.
 */
export function loadProfiles(options: SettingsScopeOptions): ProfileConfig {
  const [global, project] = readScopedSettings(options, readSection);
  const byName = new Map(global.profiles.map((profile) => [profile.name, profile]));
  for (const profile of project?.profiles ?? []) byName.set(profile.name, profile);
  const profiles = [...byName.values()];

  // A project value replaces the global one even when it is invalid, such as `null`.
  const defaultScope = project?.defaultProfile === undefined ? "global" : "project";
  const defaultName = (defaultScope === "project" ? project : global)?.defaultProfile;
  const defaultProfile = profiles.find(({ name }) => name === defaultName);
  const warnings = [
    ...global.warnings.map((warning) => `global ${warning}`),
    ...(project?.warnings ?? []).map((warning) => `project ${warning}`)
  ];
  if (defaultName !== undefined && !defaultProfile)
    warnings.push(
      `${defaultScope} defaultProfile names no valid profile; no profile applies by default`
    );

  return {
    profiles,
    defaultProfile,
    shortcut: project?.shortcut ?? global.shortcut ?? DEFAULT_SHORTCUT,
    warnings
  };
}
