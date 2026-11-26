import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import type { McpServerConfig } from "@earendil-works/pi-coding-agent";
import {
  readScopedSections,
  readSettingsFile,
  type ScopedSection,
  type SettingsScope,
  type SettingsScopeOptions
} from "@pi-mono/libs/settings-file";
import { canonicalKeySchema } from "@pi-mono/libs/tui/keybindings";
import { modelReferenceSchema } from "@pi-mono/utils/model-reference";
import { expandHomePath } from "@pi-mono/utils/paths";
import { MODEL_THINKING_LEVELS } from "@pi-mono/utils/thinking-levels";
import { z } from "zod";

import { profileNameSchema } from "./notice.ts";
import {
  CLEAR,
  MAX_MERGED_PRESETS,
  MAX_PRESETS,
  mcpNamespace,
  presetNameSchema,
  presetRefsProblem
} from "./presets.ts";

const SETTINGS_KEY = "ext.pi-profiles";
const DEFAULT_SHORTCUT = "alt+i";

const MAX_PROFILES = 100;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_PROMPTS = 32;
const MAX_TOOLS = 256;
const MAX_TOOL_NAME_LENGTH = 256;
const MAX_SERVERS = 32;

/** A tool name, or a pattern where `*` matches any characters. */
const toolNameSchema = z.string().min(1).max(MAX_TOOL_NAME_LENGTH);
const toolListSchema = z.array(toolNameSchema).max(MAX_TOOLS);

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * MCP servers. Pi does not export its validator, and checks each name and entry when the extension registers the server, so here an entry only has to be an object. A custom check keeps the supplied object: a Zod record drops an own `__proto__` key.
 */
const mcpServersSchema = z.custom<Record<string, McpServerConfig>>((value) => {
  if (!isObject(value)) return false;
  const servers: unknown[] = Object.values(value);

  return servers.length <= MAX_SERVERS && servers.every(isObject);
});

const presetSchema = z.strictObject({
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  mcpServers: mcpServersSchema.refine((servers) => Object.keys(servers).length > 0)
});

/** Validates without replacement, so that a preset named `__proto__` keeps its entry. */
const presetsSchema = z.custom<object>(
  (value) => isObject(value) && Object.keys(value).length <= MAX_PRESETS
);

const profileSchema = z.strictObject({
  name: profileNameSchema,
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
    .optional(),
  mcpServers: mcpServersSchema.optional(),
  // Preset names, which resolve against the presets of both settings files.
  mcpPresets: z.array(presetNameSchema).max(MAX_MERGED_PRESETS).optional()
});

const sectionSchema = z.looseObject({
  profiles: z.array(z.unknown()).max(MAX_PROFILES).optional(),
  mcpPresets: presetsSchema.optional(),
  defaultProfile: z.string().optional(),
  shortcut: canonicalKeySchema.optional()
});

export type Profile = Omit<z.output<typeof profileSchema>, "appendSystemPrompts"> & {
  /** The non-empty texts of the `appendSystemPrompts` files, read when settings load. */
  prompts: string[];
  /** The settings scope (`global` or `project`) that supplies the profile. */
  scope: SettingsScope;
};

/** A named set of MCP servers that the user turns on and off alongside the profile. */
export type McpPreset = {
  name: string;
  description: string | undefined;
  mcpServers: Record<string, McpServerConfig>;
  /** The settings scope (`global` or `project`) that supplies the preset. */
  scope: SettingsScope;
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

export type ProfileConfig = {
  /**
   * Valid global profiles in declaration order, each replaced in place by the project profile with its name, then the other project profiles. The shortcut cycles through them in this order.
   */
  profiles: Profile[];
  defaultProfile: Profile | undefined;
  shortcut: Shortcut;
  /**
   * Valid global presets in declaration order, each replaced in place by the project preset with its name, then the other project presets. Active presets keep this order.
   */
  mcpPresets: McpPreset[];
  warnings: string[];
};

/** One file's section. Each field recovers on its own. */
type Section = {
  /** The settings file, which `appendSystemPrompts` paths resolve against. */
  path: string;
  /**
   * Each profile that is valid on its own, with its index in the file's `profiles` array, for warnings. Duplicate names and preset references are checked against the merged presets, and only then are its `appendSystemPrompts` files read.
   */
  profiles: {
    index: number;
    profile: Omit<Profile, "prompts">;
    appendSystemPrompts: string[];
  }[];
  mcpPresets: McpPreset[];
  /** The supplied value, which the merged profiles resolve. */
  defaultProfile: unknown;
  shortcut: Shortcut | undefined;
  warnings: string[];
};

function readSection(scoped: ScopedSection): Section {
  const section: Section = {
    path: scoped.path,
    profiles: [],
    mcpPresets: [],
    defaultProfile: undefined,
    shortcut: undefined,
    warnings: []
  };

  if (scoped.status === "unreadable") {
    section.warnings.push("settings.json could not be read; its profiles were ignored");

    return section;
  }

  if (scoped.value === undefined) return section;
  const parsed = z.record(z.string(), z.unknown()).safeParse(scoped.value);

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
    section.warnings.push(
      `profiles is invalid; expected an array of at most ${MAX_PROFILES} profiles`
    );

  for (const [index, rawProfile] of (profiles.data ?? []).entries()) {
    const profile = profileSchema.safeParse(rawProfile);

    if (!profile.success) {
      section.warnings.push(`profiles[${index}] skipped: invalid profile; check its fields`);
    } else if (profile.data.name === CLEAR) {
      section.warnings.push(`profiles[${index}] skipped: the name ${CLEAR} is reserved`);
    } else if (
      scoped.scope === "project" &&
      Object.values(profile.data.mcpServers ?? {}).some((server) => "auth" in server)
    ) {
      // As in a project `mcp.json`: a repository must not choose where a Pi login token goes.
      section.warnings.push(
        `profiles[${index}] skipped: an MCP server uses auth, which only global profiles can use`
      );
    } else {
      const { appendSystemPrompts = [], ...rest } = profile.data;
      section.profiles.push({
        index,
        profile: { ...rest, scope: scoped.scope },
        appendSystemPrompts
      });
    }
  }

  const presets = fields.mcpPresets.safeParse(parsed.data.mcpPresets);
  if (presets.success)
    section.mcpPresets = readPresets(presets.data, scoped.scope, section.warnings);
  else
    section.warnings.push(
      `mcpPresets is invalid; expected an object of at most ${MAX_PRESETS} presets`
    );

  const shortcut = fields.shortcut.safeParse(parsed.data.shortcut);
  if (shortcut.success) section.shortcut = shortcut.data;
  else section.warnings.push("shortcut is invalid and was ignored");

  section.defaultProfile = parsed.data.defaultProfile;

  return section;
}

/**
 * The valid presets of one file's `mcpPresets` object. Warnings name an entry by its position, counted from 1, because the key is a supplied value.
 */
function readPresets(
  value: object | undefined,
  scope: SettingsScope,
  warnings: string[]
): McpPreset[] {
  const presets: McpPreset[] = [];

  for (const [index, [name, rawPreset]] of Object.entries(value ?? {}).entries()) {
    const label = `mcpPresets entry ${index + 1} skipped`;
    const preset = presetSchema.safeParse(rawPreset);

    if (!presetNameSchema.safeParse(name).success) {
      warnings.push(
        `${label}: invalid name; use up to 64 characters without spaces, control characters, or commas`
      );
    } else if (name === CLEAR) {
      warnings.push(`${label}: the name ${CLEAR} is reserved`);
    } else if (!preset.success) {
      warnings.push(
        `${label}: invalid preset; expected mcpServers (1 to ${MAX_SERVERS} servers) and an optional description`
      );
    } else if (
      scope === "project" &&
      Object.values(preset.data.mcpServers).some((server) => "auth" in server)
    ) {
      warnings.push(`${label}: an MCP server uses auth, which only global presets can use`);
    } else if (
      new Set(Object.keys(preset.data.mcpServers).map(mcpNamespace)).size !==
      Object.keys(preset.data.mcpServers).length
    ) {
      // Pi refuses to register a second server whose name differs only in `-` and `_`.
      warnings.push(`${label}: two MCP server names differ only in - and _`);
    } else {
      presets.push({
        name,
        description: preset.data.description,
        mcpServers: preset.data.mcpServers,
        scope
      });
    }
  }

  return presets;
}

/**
 * The section's profiles whose `mcpPresets` resolve against the merged presets without a conflict and whose `appendSystemPrompts` files can be read, without a later profile whose name a valid one has. Only a valid profile reserves its name, so a skipped profile does not hide a valid one. The files of a skipped profile are not read.
 */
function validProfiles(section: Section, presets: readonly McpPreset[]): Profile[] {
  const valid = new Map<string, Profile>();

  for (const { index, profile, appendSystemPrompts } of section.profiles) {
    const problem = valid.has(profile.name)
      ? "duplicate name"
      : presetRefsProblem(profile, presets);

    if (problem) {
      section.warnings.push(`profiles[${index}] skipped: ${problem}`);
      continue;
    }

    const prompts = readPrompts(appendSystemPrompts, section.path);
    if (typeof prompts === "number")
      section.warnings.push(
        `profiles[${index}] skipped: appendSystemPrompts[${prompts}] could not be read`
      );
    else valid.set(profile.name, { ...profile, prompts });
  }

  return [...valid.values()];
}

/**
 * Reads global settings, and project settings only in a trusted project, because profiles choose tools and system prompt text. Project values take precedence. Warnings name the file's scope, but never repeat supplied keys or values.
 */
export function loadProfiles(options: SettingsScopeOptions): ProfileConfig {
  const [globalSettings, projectSettings] = readScopedSections(options, SETTINGS_KEY);
  const global = readSection(globalSettings);
  const project = projectSettings && readSection(projectSettings);
  // Profiles resolve their presets after the merge, so a project preset that replaces a global one also decides whether a global profile that names it conflicts.
  const presetsByName = new Map(global.mcpPresets.map((preset) => [preset.name, preset]));
  for (const preset of project?.mcpPresets ?? []) presetsByName.set(preset.name, preset);
  const mcpPresets = [...presetsByName.values()];
  const byName = new Map(
    validProfiles(global, mcpPresets).map((profile) => [profile.name, profile])
  );
  for (const profile of project ? validProfiles(project, mcpPresets) : [])
    byName.set(profile.name, profile);
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
    mcpPresets,
    warnings
  };
}
