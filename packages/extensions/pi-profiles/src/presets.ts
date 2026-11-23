import type { McpServerConfig, SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import { profileNameSchema } from "./notice.ts";
import type { McpPreset, Profile } from "./settings.ts";

/** The presets of one settings file. */
export const MAX_PRESETS = 100;

/** The presets of both settings files together. */
export const MAX_MERGED_PRESETS = MAX_PRESETS * 2;

/** A profile name that can also stand in the comma-separated `--mcp-presets` list. */
export const presetNameSchema = profileNameSchema.regex(/^[^,]+$/u);

/** Saves the active MCP presets on the branch. It names each preset and its scope, never its servers, which can contain secrets. */
export const PRESETS_ENTRY = "pi-profiles.mcp-presets";

/** `/profile clear` selects no profile, and `/mcp-presets clear` turns off every preset, so no profile or preset can have this name. */
export const CLEAR = "clear";

const presetsEntrySchema = z.strictObject({
  presets: z
    .array(z.strictObject({ name: presetNameSchema, scope: z.enum(["global", "project"]) }))
    .max(MAX_MERGED_PRESETS)
});

export type PresetsEntry = z.output<typeof presetsEntrySchema>;

type PresetRef = PresetsEntry["presets"][number];

/**
 * The namespace of a server's tools. Pi refuses to register a server whose name differs from a registered one only in `-` and `_` (`mcpNamespace` in pi-mcp, which this package does not depend on).
 */
export const mcpNamespace = (name: string) => name.replace(/-/g, "_");

/** A server of one set whose name, or namespace, a server of the other set has. */
type ServerClash = { server: string; other: string };

function serverClash(
  servers: Readonly<Record<string, McpServerConfig>>,
  others: Readonly<Record<string, McpServerConfig>>
): ServerClash | undefined {
  const names = new Map(Object.keys(others).map((name) => [mcpNamespace(name), name]));

  for (const server of Object.keys(servers)) {
    const other = names.get(mcpNamespace(server));
    if (other !== undefined) return { server, other };
  }

  return undefined;
}

/** A preset's server clashes with a server of `preset`. */
export type PresetConflict = ServerClash & { preset: McpPreset };

/** The first preset of `presets` whose servers clash with the preset's. */
export function presetConflict(
  preset: McpPreset,
  presets: readonly McpPreset[]
): PresetConflict | undefined {
  for (const other of presets) {
    if (other === preset) continue;
    const clash = serverClash(preset.mcpServers, other.mcpServers);
    if (clash) return { ...clash, preset: other };
  }

  return undefined;
}

/** The names of the profile's servers that the presets' servers replace, by name or namespace. */
export function overriddenServers(
  presets: readonly McpPreset[],
  servers: Readonly<Record<string, McpServerConfig>> | undefined
): string[] {
  const namespaces = new Set(
    presets.flatMap((preset) => Object.keys(preset.mcpServers)).map(mcpNamespace)
  );

  return Object.keys(servers ?? {}).filter((name) => namespaces.has(mcpNamespace(name)));
}

/**
 * Why the profile's `mcpPresets` cannot apply, or undefined when they can: a name is listed twice, names no preset, or two of its presets, or a preset and the profile's own servers, share a server name or namespace. The reasons name no supplied value.
 */
export function presetRefsProblem(
  profile: Pick<Profile, "mcpPresets" | "mcpServers">,
  presets: readonly McpPreset[]
): string | undefined {
  const names = profile.mcpPresets ?? [];
  if (new Set(names).size !== names.length) return "mcpPresets lists a preset twice";
  const listed = names.map((name) => presets.find((preset) => preset.name === name));
  if (listed.some((preset) => preset === undefined))
    return "mcpPresets names a preset that is not configured";
  const resolved = listed.filter((preset) => preset !== undefined);
  if (resolved.some((preset) => presetConflict(preset, resolved)))
    return "two of its MCP presets define servers whose names differ at most in - and _";
  if (overriddenServers(resolved, profile.mcpServers).length > 0)
    return "an MCP preset defines a server whose name differs from one in mcpServers at most in - and _";

  return undefined;
}

/** The preset's description, or else its server names. */
export const presetSummary = (preset: McpPreset) =>
  preset.description ?? `Servers: ${Object.keys(preset.mcpServers).join(", ")}`;

/** The presets in settings declaration order. */
export const inDeclarationOrder = (
  chosen: readonly McpPreset[],
  presets: readonly McpPreset[]
): McpPreset[] => presets.filter((preset) => chosen.includes(preset));

/** The presets that the profile's `mcpPresets` turn on, or undefined when the profile leaves them. */
export function profilePresets(
  profile: Profile | undefined,
  presets: readonly McpPreset[]
): McpPreset[] | undefined {
  const names = profile?.mcpPresets;

  return names && presets.filter((preset) => names.includes(preset.name));
}

/**
 * The servers to register: the profile's, then the active presets'. A preset's server replaces a profile server whose name it has or shares a namespace with, so that Pi does not refuse it. A map, because an object would turn a `__proto__` name into a prototype.
 */
export function effectiveServers(
  profileServers: Readonly<Record<string, McpServerConfig>> | undefined,
  presets: readonly McpPreset[]
): Map<string, McpServerConfig> {
  const replaced = new Set(overriddenServers(presets, profileServers));
  const servers = new Map(
    Object.entries(profileServers ?? {}).filter(([name]) => !replaced.has(name))
  );
  for (const preset of presets)
    for (const [name, config] of Object.entries(preset.mcpServers)) servers.set(name, config);

  return servers;
}

/**
 * How the registered MCP servers become `target`, the selected profile's and the active presets'. A server whose config serialises the same, as Pi compares it, is not registered again, so it keeps its connection and the server list does not change. Key order counts, because Pi tries `toolExposure` patterns in order. A changed server is unregistered first, so a failed registration leaves no server of the previous profile.
 */
export function planServers(
  registered: ReadonlyMap<string, McpServerConfig>,
  target: ReadonlyMap<string, McpServerConfig>
): { unregister: string[]; register: [string, McpServerConfig][] } {
  const kept = (name: string) => {
    const config = registered.get(name);

    return config !== undefined && JSON.stringify(config) === JSON.stringify(target.get(name));
  };

  return {
    unregister: [...registered.keys()].filter((name) => !kept(name)),
    register: [...target].filter(([name]) => !kept(name))
  };
}

/** The result of turning a preset on or off. */
export type Toggle =
  | { active: McpPreset[]; enabled: boolean }
  | { conflict: PresetConflict; active?: undefined };

/** Turns the preset off when it is active, or else on, unless it clashes with an active preset. */
export function togglePreset(
  preset: McpPreset,
  active: readonly McpPreset[],
  presets: readonly McpPreset[]
): Toggle {
  if (active.includes(preset))
    return { active: active.filter((other) => other !== preset), enabled: false };
  const conflict = presetConflict(preset, active);

  return conflict
    ? { conflict }
    : { active: inDeclarationOrder([...active, preset], presets), enabled: true };
}

/** The entry that saves the active presets. */
export const presetsEntry = (active: readonly McpPreset[]): PresetsEntry => ({
  presets: active.map(({ name, scope }) => ({ name, scope }))
});

/** The branch's latest valid presets entry, or undefined when the branch has none. */
export function latestPresets(branch: readonly SessionEntry[]): PresetRef[] | undefined {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type !== "custom" || entry.customType !== PRESETS_ENTRY) continue;
    const parsed = presetsEntrySchema.safeParse(entry.data);
    if (parsed.success) return parsed.data.presets;
  }

  return undefined;
}

/**
 * The saved presets that the current settings supply from the same scope, in declaration order, without those that clash with an earlier one. A saved project preset does not restore in an untrusted project, also when a global preset has its name.
 */
export function restorePresets(
  saved: readonly PresetRef[] | undefined,
  presets: readonly McpPreset[]
): { active: McpPreset[]; warnings: string[] } {
  const warnings: string[] = [];
  const found = presets.filter((preset) =>
    saved?.some(({ name, scope }) => name === preset.name && scope === preset.scope)
  );
  for (const { name, scope } of saved ?? [])
    if (!found.some((preset) => preset.name === name && preset.scope === scope))
      warnings.push(
        scope === "project"
          ? `saved project MCP preset ${name} is no longer configured or the project is untrusted; it stays off. Trust the project and restore it in project settings, or run /mcp-presets clear to drop it.`
          : `saved global MCP preset ${name} is no longer configured; it stays off. Restore it in global settings, or run /mcp-presets clear to drop it.`
      );

  const active: McpPreset[] = [];

  for (const preset of found) {
    const conflict = presetConflict(preset, active);
    if (conflict)
      warnings.push(
        `saved MCP preset ${preset.name} stays off: its server ${conflict.server} clashes with ${conflict.other} of preset ${conflict.preset.name}`
      );
    else active.push(preset);
  }

  return { active, warnings };
}

/**
 * The presets that a `--mcp-presets` value turns on, in declaration order, or why the whole value is invalid. `clear` alone turns them all off.
 */
export function parsePresetsFlag(
  value: string,
  presets: readonly McpPreset[]
): { presets: McpPreset[] } | { error: string } {
  const names = value.split(",").map((name) => name.trim());
  if (names.includes("")) return { error: "an entry is empty" };
  if (names.includes(CLEAR))
    return names.length === 1
      ? { presets: [] }
      : { error: `${CLEAR} cannot be combined with presets` };
  if (new Set(names).size !== names.length) return { error: "a preset is listed twice" };

  const listed = names.map((name) => presets.find((preset) => preset.name === name));
  if (listed.some((preset) => preset === undefined))
    return { error: "an entry names no configured preset" };
  const chosen = inDeclarationOrder(
    listed.filter((preset) => preset !== undefined),
    presets
  );

  for (const preset of chosen) {
    const conflict = presetConflict(preset, chosen);
    if (conflict)
      return {
        error: `presets ${conflict.preset.name} and ${preset.name} define servers ${conflict.other} and ${conflict.server}, whose names differ at most in - and _`
      };
  }

  return { presets: chosen };
}
