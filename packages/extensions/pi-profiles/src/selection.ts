import { getCurrentSystemMessage } from "@earendil-works/pi-ai";
import type {
  McpServerConfig,
  SessionEntry,
  ToolExposure,
  ToolInfo
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import {
  formatNoticeRefs,
  NOTICE_MESSAGE,
  profileNoticeSchema,
  type ProfileNoticeDetails,
  type ProfileRef
} from "./notice.ts";
import type { Profile } from "./settings.ts";

export const SELECTION_ENTRY = "pi-profiles.selection";

/** Records the profile of a run whose selection the settings did not supply; see {@link runRecord}. */
export const RUN_ENTRY = "pi-profiles.run";

/** Pi's tool that loads inactive tools. Pi does not export the name. */
const TOOL_SEARCH = "tool_search";

/** Old sessions keep their entries, and an entry that fails this schema is skipped without an error, so a change here loses those selections. */
const selectionFields = {
  /** Active tools without the profile; the next switch starts from them again. */
  base: z.array(z.string()),
  /** Active tools right after the switch. */
  tools: z.array(z.string()),
  /**
   * Tools that the profile deferred; `tool_search` can load them. The tools of an array are a group, which loads together.
   */
  deferred: z.array(z.union([z.string(), z.array(z.string())]))
};

const selectionSchema = z.union([
  z.object({
    name: z.string(),
    scope: z.enum(["global", "project"]),
    ...selectionFields
  }),
  z.object({
    name: z.undefined().optional(),
    scope: z.undefined().optional(),
    ...selectionFields
  })
]);

export type Selection = z.output<typeof selectionSchema>;

type Deferred = Selection["deferred"];

/** What the latest selection keeps in force until the next selection. */
export type Rules = {
  /** The selection's deferred tools, which the extension's `tool_search` can load. */
  deferred: Deferred;
  /** The selected profile's `deny` list. Its tools stay off. */
  deny: readonly string[];
};

/** What Pi reports now. */
type ToolState = {
  /** The session branch, from the root to the leaf. */
  branch: readonly SessionEntry[];
  /** Pi's active tools. */
  active: readonly string[];
  /** Pi's registered tools. */
  tools: readonly ToolInfo[];
  /** The `reachesTools` function of the extension's `tool_search`, which identifies it in `tools`. */
  searchReach: ToolInfo["reachesTools"];
};

/** A registered tool and how the model can reach it now. */
export type ToolReport = {
  tool: ToolInfo;
  /**
   * `active` in Pi's tool set, `deferred` by the latest selection, `searchable` by Pi's `tool_search`, `off`, or `hidden`. A saved deferral does not override the current `deny` list, which the extension's `tool_search` applies.
   */
  status: "active" | "deferred" | "searchable" | "off" | "hidden";
  /**
   * Whether the active `tool_search` can load the tool while it is inactive: `inactive` when no `tool_search` is active, and `cannot` for a `direct` or `model-only` tool when the active one is not the extension's copy.
   */
  search: "loads" | "cannot" | "inactive";
  /** The other tools of the deferred group that loads together with the tool. */
  group: readonly string[] | undefined;
  /** Whether the branch called the tool. */
  used: boolean;
  /** Which lists of the selected profile name the tool; undefined when it has no `tools`. */
  lists: ProfileLists | undefined;
};

type ProfileLists = {
  /**
   * `selects`; `unlisted`; or `pattern` when an `allow` pattern matches the tool but does not select it. Undefined without `allow`.
   */
  allow: "selects" | "unlisted" | "pattern" | undefined;
  deny: boolean;
  /** The kind of the first `defer` entry that matches the tool: a name or pattern, or a group. */
  defer: "name" | "group" | undefined;
  /**
   * Whether a profile that defers `direct` or `model-only` tools turns the tool on: it is the extension's `tool_search`, and the profile does not deny it.
   */
  activatesSearch: boolean;
};

type SwitchPlan = {
  /** The tools to set. */
  tools: string[];
  /**
   * The tool change that the switch requests now, in the words of the switch notice. Pi ignores unknown and `hidden` names. Pi can still leave out an MCP tool that a `--tools` list does not name.
   */
  change: string;
  /** The switch's result after Pi set the tools to `active`. */
  settle(this: void, active: readonly string[]): { entry: Selection; rules: Rules; change: string };
};

type RestoreOptions = {
  /** `/reload`, which keeps the active tools and turns on `direct` extension tools again. */
  reload: boolean;
  /** On tree navigation, the outgoing selection, which a destination without a tool record undoes. */
  previous: Selection | undefined;
  /** The configured profiles, which supply the selection's `deny` list. */
  profiles: readonly Profile[];
  /** The branch's messages, which supply the tool record. Read only when the plan needs them. */
  messages: () => Parameters<typeof getCurrentSystemMessage>[0];
};

type RestorePlan = {
  /** The branch's latest selection. */
  selection: Selection | undefined;
  rules: Rules;
  /** The tools to set; undefined when they do not change. */
  tools: string[] | undefined;
};

/** The model-facing notice to append at `before_agent_start`, in Pi's `BeforeAgentStartEventResult["message"]` shape. */
export type ProfileNoticeMessage = {
  customType: typeof NOTICE_MESSAGE;
  content: string;
  display: true;
  details: ProfileNoticeDetails;
};

/** Records a run whose selected profile the settings did not supply, so the next run compares against no profile. */
const runSchema = z.strictObject({});

type RunRecord = z.output<typeof runSchema>;

type EffectiveProfile = { profile: ProfileRef | undefined };

/**
 * The profile-change notice to append when the effective profile differs from the profile of the previous run on `branch`. Returns `undefined` before the branch's first run or when the effective profile is unchanged.
 */
export function profileNotice(
  branch: readonly SessionEntry[],
  profiles: readonly Profile[]
): ProfileNoticeMessage | undefined {
  const lastRun = lastRunProfile(branch);
  if (!lastRun) return undefined;

  const selection = latestSelection(branch);
  const currentProfile = selectedProfile(selection, profiles);
  const current = currentProfile && { name: currentProfile.name, scope: currentProfile.scope };
  const previous = lastRun.profile;
  if (sameRef(previous, current)) return undefined;

  let details: ProfileNoticeDetails;
  if (previous && current) details = { kind: "switched", from: previous, to: current };
  else if (current) details = { kind: "set", to: current };
  else if (previous)
    details = {
      kind: sameRef(previous, selectionRef(selection)) ? "unavailable" : "cleared",
      from: previous
    };
  else return undefined;

  return {
    customType: NOTICE_MESSAGE,
    content: formatNoticeContent(details, currentProfile?.description),
    display: true,
    details
  };
}

/**
 * The `pi-profiles.run` entry to save at `turn_end`, when the branch does not already give the run its effective profile. That happens when the run's selection names a profile that the settings do not supply and no notice recorded the result, such as on the branch's first run.
 */
export function runRecord(
  branch: readonly SessionEntry[],
  profiles: readonly Profile[]
): RunRecord | undefined {
  const profile = selectedProfile(latestSelection(branch), profiles);
  const current = profile && { name: profile.name, scope: profile.scope };
  if (current || sameRef(lastRunProfile(branch)?.profile, undefined)) return undefined;

  return {};
}

/**
 * The profile of the branch's last run, or `undefined` before its first run. A run counts by the entries that follow its starting message: its `assistant` messages, its notice, or its run entry. Its `system` message does not count: Pi adds it before the starting message, so `/tree` or `/fork` to the prompt keeps it without the run. Its `user` message does not count either: `/tree` to the notice keeps the prompt without the notice or a response. The profile is the one that the latest notice, run entry, or selection at or before the last run records.
 */
function lastRunProfile(branch: readonly SessionEntry[]): EffectiveProfile | undefined {
  let ran = false;

  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    ran ||= isRunEntry(entry);
    const recorded = ran ? recordedProfile(entry) : undefined;
    if (recorded) return recorded;
  }

  return ran ? { profile: undefined } : undefined;
}

const isRunEntry = (entry: SessionEntry | undefined) =>
  (entry?.type === "message" && entry.message.role === "assistant") ||
  (entry?.type === "custom_message" && entry.customType === NOTICE_MESSAGE) ||
  (entry?.type === "custom" && entry.customType === RUN_ENTRY);

/** The profile that a notice, run entry, or selection records; a selection records the profile it names. */
function recordedProfile(entry: SessionEntry | undefined): EffectiveProfile | undefined {
  if (entry?.type === "custom_message" && entry.customType === NOTICE_MESSAGE) {
    const notice = profileNoticeSchema.safeParse(entry.details).data;
    if (!notice) return undefined;

    return notice.kind === "switched" || notice.kind === "set"
      ? { profile: notice.to }
      : { profile: undefined };
  }

  if (entry?.type === "custom" && entry.customType === RUN_ENTRY)
    return runSchema.safeParse(entry.data).success ? { profile: undefined } : undefined;

  const selection = decodeSelection(entry);

  return selection && { profile: selectionRef(selection) };
}

const selectionRef = (selection: Selection | undefined): ProfileRef | undefined =>
  selection?.name === undefined ? undefined : { name: selection.name, scope: selection.scope };

const sameRef = (a: ProfileRef | undefined, b: ProfileRef | undefined) =>
  a?.name === b?.name && a?.scope === b?.scope;

function formatNoticeContent(
  details: ProfileNoticeDetails,
  description: string | undefined
): string {
  const summary = description?.trim();
  const suffix = summary ? ` (${summary})` : "";
  const tail = "Follow the updated system prompt and tools. The user did not send this message.";

  switch (details.kind) {
    case "switched": {
      const { from, to } = formatNoticeRefs(details.from, details.to);

      return `The active profile switched from ${from} to ${to}${suffix}. ${tail}`;
    }

    case "set":
      return `The active profile is now ${details.to.name}${suffix}. ${tail}`;

    case "cleared":
      return `The active profile was cleared (was ${details.from.name}). ${tail}`;

    case "unavailable":
      return `Profile ${details.from.name} was deactivated because it is no longer available; no profile is active. ${tail}`;
  }
}

/** The branch's latest valid selection. */
export const latestSelection = (branch: readonly SessionEntry[]) => latestEntry(branch)?.selection;

/**
 * The selection's profile, when the current settings supply it from the settings scope that supplied it at the switch. In an untrusted project, a project profile is not supplied, also when a global profile has its name.
 */
export const selectedProfile = (selection: Selection | undefined, profiles: readonly Profile[]) =>
  selection?.name === undefined
    ? undefined
    : profiles.find(({ name, scope }) => name === selection.name && scope === selection.scope);

/**
 * What a switch to the profile, or to no profile, does now. It undoes the latest selection's tool changes, and resolves the profile's tools from the result, the base tools. The menu shows the same plan's change.
 */
export function planSwitch(profile: Profile | undefined, state: ToolState): SwitchPlan {
  const before = state.active;
  const base = baseTools(before, latestSelection(state.branch));
  const exposure = exposures(state.tools);
  const { tools, deferred } = profile
    ? profileTools(profile, {
        base,
        active: before,
        used: usedTools(state.branch),
        exposure,
        ownsToolSearch: ownsToolSearch(state)
      })
    : { tools: base, deferred: [] };
  const deferredNames = new Set(deferred.flat());
  // Pi ignores unknown and `hidden` names, as in the switch.
  const declared = tools.filter((name) => exposure.has(name) && exposure.get(name) !== "hidden");

  return {
    tools,
    change: describeChange(before, declared, deferredNames),
    settle: (active) => ({
      entry: {
        ...(profile ? { name: profile.name, scope: profile.scope } : {}),
        // Code unit order, so that the entry does not follow load order. Restoration reads only which tools they name.
        base: [...base].sort(),
        tools: [...active].sort(),
        deferred
      },
      rules: { deferred, deny: profile?.tools?.deny ?? [] },
      change: describeChange(before, active, deferredNames)
    })
  };
}

/**
 * What to restore after Pi restored the branch on resume, `/fork`, `/tree`, or `/reload`: the branch's latest selection, its rules, and the tools to set.
 */
export function planRestore(state: ToolState, options: RestoreOptions): RestorePlan {
  const latest = latestEntry(state.branch);
  const selection = latest?.selection;
  const profile = selectedProfile(selection, options.profiles);
  // The saved tools and deferral of a profile that the settings no longer supply restore nothing, as on a branch without a selection, so untrusted project settings cannot choose them. The same holds for the outgoing selection that tree navigation undoes.
  const applies = (saved: Selection) =>
    saved.name === undefined || selectedProfile(saved, options.profiles) !== undefined;
  const applied = latest && applies(latest.selection) ? latest : undefined;
  const previous = options.previous && applies(options.previous) ? options.previous : undefined;
  const rules = { deferred: applied?.selection.deferred ?? [], deny: profile?.tools?.deny ?? [] };

  return {
    selection,
    rules,
    tools: restoreTarget(applied, state, { ...options, previous }, rules.deny)
  };
}

/**
 * How the registered MCP servers become the selected profile's. A server whose config serialises the same, as Pi compares it, is not registered again, so it keeps its connection and the server list does not change. Key order counts, because Pi tries `toolExposure` patterns in order. A changed server is unregistered first, so a failed registration leaves no server of the previous profile.
 */
export function planServers(
  registered: ReadonlyMap<string, McpServerConfig>,
  next: Readonly<Record<string, McpServerConfig>> | undefined
): { unregister: string[]; register: [string, McpServerConfig][] } {
  const target = new Map(Object.entries(next ?? {}));

  const kept = (name: string) => {
    const config = registered.get(name);

    return config !== undefined && JSON.stringify(config) === JSON.stringify(target.get(name));
  };

  return {
    unregister: [...registered.keys()].filter((name) => !kept(name)),
    register: [...target].filter(([name]) => !kept(name))
  };
}

/** The active tools without the `deny` matches. Undefined when no active tool matches. */
export function enforcedTools(active: readonly string[], rules: Rules): string[] | undefined {
  const denied = toolMatcher(rules.deny);
  const kept = active.filter((name) => !denied(name));

  return kept.length === active.length ? undefined : kept;
}

/**
 * The registered tools as the extension's `tool_search` sees them: without the `deny` tools, which stay off, and with the deferred `direct` and `model-only` tools as `deferred`, so it finds and loads them.
 */
export function searchableTools(tools: readonly ToolInfo[], rules: Rules): ToolInfo[] {
  const names = new Set(rules.deferred.flat());
  const denied = toolMatcher(rules.deny);

  return tools
    .filter((tool) => !denied(tool.name))
    .map((tool): ToolInfo =>
      names.has(tool.name) && isDirect(tool.exposure) ? { ...tool, exposure: "deferred" } : tool
    );
}

/**
 * `names` with the rest of each deferred group whose tools it turns on, so that `tool_search` loads a group's tools together. A group's `deny` tools stay off.
 */
export function withGroups(
  names: readonly string[],
  active: readonly string[],
  { deferred, deny }: Rules
): string[] {
  const loading = names.filter((name) => !active.includes(name));
  const groups = deferred.filter(
    (entry) => typeof entry !== "string" && entry.some((name) => loading.includes(name))
  );
  const denied = toolMatcher(deny);

  return [...new Set([...names, ...groups.flat().filter((name) => !denied(name))])];
}

/** How the model can reach each registered tool now, and which lists of `profile` name it. */
export function reportTools(
  state: ToolState,
  rules: Rules,
  profile: Profile | undefined
): ToolReport[] {
  const owns = ownsToolSearch(state);
  const deferred = rules.deferred.flat();
  const used = usedTools(state.branch);
  const denied = toolMatcher(profile?.tools?.deny ?? []);
  const searchActive = state.active.includes(TOOL_SEARCH);
  const lists = profileLists(profile, baseTools(state.active, latestSelection(state.branch)), owns);

  const status = ({ name, exposure }: ToolInfo): ToolReport["status"] => {
    if (exposure === "hidden") return "hidden";
    if (state.active.includes(name)) return "active";
    if (owns && denied(name)) return "off";
    if (deferred.includes(name)) return "deferred";

    return isDirect(exposure) ? "off" : "searchable";
  };

  // Only the extension's `tool_search` finds deferred `direct` and `model-only` tools.
  const search = ({ exposure }: ToolInfo): ToolReport["search"] => {
    if (!searchActive) return "inactive";

    return isDirect(exposure) && !owns ? "cannot" : "loads";
  };

  return state.tools.map((tool) => {
    const group = rules.deferred.find(
      (entry) => typeof entry !== "string" && entry.includes(tool.name)
    );

    return {
      tool,
      status: status(tool),
      search: search(tool),
      group:
        typeof group === "object"
          ? group.filter((name) => name !== tool.name && !denied(name))
          : undefined,
      used: used.has(tool.name),
      lists: lists(tool)
    };
  });
}

/** The branch's latest valid selection and its position. */
function latestEntry(
  branch: readonly SessionEntry[]
): { selection: Selection; index: number } | undefined {
  for (let index = branch.length - 1; index >= 0; index--) {
    const selection = decodeSelection(branch[index]);
    if (selection) return { selection, index };
  }

  return undefined;
}

/** The selection that a `pi-profiles.selection` entry saved, when valid. */
function decodeSelection(entry: SessionEntry | undefined): Selection | undefined {
  return entry?.type === "custom" && entry.customType === SELECTION_ENTRY
    ? selectionSchema.safeParse(entry.data).data
    : undefined;
}

/**
 * Whether a request followed the selection at `index`, so that the transcript records its tools. Pi adds a system message before a request that changes the tools or the prompt, and can omit it when both stay, so a response also counts. Without either, the recorded tools predate the selection. A compaction checkpoint copies the earlier record, so it does not count.
 */
function loadoutRecordedAfter(branch: readonly SessionEntry[], index: number): boolean {
  return branch
    .slice(index + 1)
    .some(
      (entry) =>
        entry.type === "message" &&
        (entry.message.role === "system" || entry.message.role === "assistant")
    );
}

/** Tools the branch has called. */
function usedTools(branch: readonly SessionEntry[]): Set<string> {
  return new Set(
    branch.flatMap((entry) =>
      entry.type === "message" && entry.message.role === "toolResult"
        ? [entry.message.toolName]
        : []
    )
  );
}

const exposures = (tools: readonly ToolInfo[]) =>
  new Map(tools.map((tool) => [tool.name, tool.exposure]));

/** Whether `tools` declares a registered, non-hidden `tool_search`. */
function declaresSearch(
  tools: readonly string[],
  exposure: ReadonlyMap<string, ToolExposure>
): boolean {
  const search = exposure.get(TOOL_SEARCH);

  return search !== undefined && search !== "hidden" && tools.includes(TOOL_SEARCH);
}

/** Whether the declarable `tool_search` is the extension's, which also loads deferred tools. */
const ownsToolSearch = ({ tools, searchReach }: ToolState) =>
  searchReach !== undefined &&
  tools.some(
    ({ name, exposure, reachesTools }) =>
      name === TOOL_SEARCH && exposure !== "hidden" && reachesTools === searchReach
  );

/**
 * Undoes `previous` on the active tools: drops the tools it added and restores the ones it removed. Changes made since that switch, such as tools that `tool_search` loaded, are kept.
 */
function baseTools(active: readonly string[], previous: Selection | undefined): string[] {
  if (!previous) return [...active];
  const added = previous.tools.filter((name) => !previous.base.includes(name));
  const removed = previous.base.filter((name) => !previous.tools.includes(name));

  return [
    ...active.filter((name) => !added.includes(name)),
    ...removed.filter((name) => !active.includes(name))
  ];
}

/**
 * Whether a tool name matches one of the entries: a name, or a pattern where `*` matches any characters, as in Pi's `--tools`. Pi does not export its matcher.
 */
function toolMatcher(entries: readonly string[]): (name: string) => boolean {
  const names = new Set(entries.filter((entry) => !entry.includes("*")));
  const patterns = entries
    .filter((entry) => entry.includes("*"))
    .map(
      (entry) =>
        new RegExp(
          `^${entry
            .split("*")
            .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*")}$`
        )
    );

  return (name) => names.has(name) || patterns.some((pattern) => pattern.test(name));
}

/** The names of a `defer` entry: a name or pattern, or a group of them. */
const entryNames = (entry: string | readonly string[]) =>
  typeof entry === "string" ? [entry] : entry;

/** The index of the `defer` entry that a tool belongs to: the first entry that matches it, or -1. */
function deferEntryOf(defer: readonly (string | readonly string[])[]): (name: string) => number {
  const matchers = defer.map((entry) => toolMatcher(entryNames(entry)));

  return (name) => matchers.findIndex((matches) => matches(name));
}

/** Exposures that only the extension's `tool_search` can load while the tool is inactive. */
const isDirect = (exposure: ToolExposure | undefined) =>
  exposure === "direct" || exposure === "model-only";

/**
 * Whether a `*` pattern in `allow` selects a tool that it matches. As Pi's `--tools` does, a pattern turns on only `direct` and `model-only` tools, so `codemode` exposure stays. It also keeps the base tools, such as `codemode` tools that `tool_search` loaded.
 */
const allowPatternSelects = (
  name: string,
  exposure: ToolExposure | undefined,
  base: readonly string[]
) => isDirect(exposure) || base.includes(name);

/** Which lists of the profile name a tool. */
function profileLists(
  profile: Profile | undefined,
  base: readonly string[],
  ownsSearch: boolean
): (tool: ToolInfo) => ProfileLists | undefined {
  if (!profile?.tools) return () => undefined;
  const { allow, deny = [], defer = [] } = profile.tools;
  const allowed = toolMatcher(allow ?? []);
  const denied = toolMatcher(deny);
  const deferEntry = deferEntryOf(defer);

  const allowList = ({ name, exposure }: ToolInfo): ProfileLists["allow"] => {
    if (!allow) return undefined;
    if (!allowed(name)) return "unlisted";

    return allow.includes(name) || allowPatternSelects(name, exposure, base)
      ? "selects"
      : "pattern";
  };

  const deferList = ({ name }: ToolInfo): ProfileLists["defer"] => {
    const entry = defer[deferEntry(name)];
    if (entry === undefined) return undefined;

    return typeof entry === "string" ? "name" : "group";
  };

  return (tool) => ({
    allow: allowList(tool),
    deny: denied(tool.name),
    defer: deferList(tool),
    activatesSearch: tool.name === TOOL_SEARCH && ownsSearch && !denied(tool.name)
  });
}

/**
 * The candidates' deferral units. A tool belongs to the first `defer` entry that matches it. A group entry makes one unit of its tools; a name or pattern makes a unit of each tool. `tool_search`, unregistered tools, and `hidden` tools have no unit, so they stay.
 */
function deferUnits(
  candidates: readonly string[],
  defer: readonly (string | readonly string[])[],
  exposure: ReadonlyMap<string, ToolExposure>
): string[][] {
  const deferEntry = deferEntryOf(defer);
  const units = new Map<string | number, string[]>();

  for (const name of candidates) {
    const index = deferEntry(name);
    const tool = exposure.get(name);
    if (name === TOOL_SEARCH || tool === undefined || tool === "hidden" || index < 0) continue;
    const key = typeof defer[index] === "string" ? name : index;
    units.set(key, [...(units.get(key) ?? []), name]);
  }

  return [...units.values()];
}

type ResolveState = {
  base: readonly string[];
  active: readonly string[];
  used: ReadonlySet<string>;
  exposure: ReadonlyMap<string, ToolExposure>;
  /** Whether the registered `tool_search` is the extension's, which also loads deferred tools. */
  ownsToolSearch: boolean;
};

/**
 * `allow` (or the base tools) without `deny`. A pattern in `allow` names the registered tools that it matches and selects (see {@link allowPatternSelects}). A `defer` tool stays active when it is active now and the branch has used it, or when no declared `tool_search` can load it again. Pi's `tool_search` loads `codemode` and `deferred` tools; the extension's copy also loads `direct` and `model-only` tools that a profile deferred, and a profile that defers them declares `tool_search`. A group is deferred only as a whole, and only the extension's copy loads it together.
 */
function profileTools(
  profile: Profile,
  state: ResolveState
): { tools: string[]; deferred: Deferred } {
  const { allow, deny = [], defer = [] } = profile.tools ?? {};
  const denied = toolMatcher(deny);
  const searchesDirect = state.ownsToolSearch && !denied(TOOL_SEARCH);
  const selectable = [...state.exposure].flatMap(([name, exposure]) =>
    allowPatternSelects(name, exposure, state.base) ? [name] : []
  );
  const named = allow?.flatMap((entry) =>
    entry.includes("*") ? selectable.filter(toolMatcher([entry])) : [entry]
  );
  const candidates = [...new Set(named ?? state.base)].filter((name) => !denied(name));
  const units = deferUnits(candidates, defer, state.exposure);

  /** Which `tool_search` can load the tool again, if any. */
  const loader = (name: string) => {
    const exposure = state.exposure.get(name);
    if (searchesDirect && isDirect(exposure)) return "direct";

    return exposure === "codemode" || exposure === "deferred" ? "native" : undefined;
  };

  const active = new Set(state.active);
  /** A unit stays when the branch used one of its active tools, or a `tool_search` can't load it. */
  const deferrable = (unit: readonly string[]) =>
    (unit.length === 1 || searchesDirect) &&
    unit.every((name) => loader(name) && !(active.has(name) && state.used.has(name)));
  const deferring = new Set(units.filter(deferrable).flat());

  const tools: string[] = [];
  const direct: string[] = [];
  const native: string[] = [];

  for (const name of candidates) {
    if (!deferring.has(name)) tools.push(name);
    else (loader(name) === "direct" ? direct : native).push(name);
  }

  if (direct.length > 0 && !tools.includes(TOOL_SEARCH)) tools.push(TOOL_SEARCH);
  const searchDeclared = declaresSearch(tools, state.exposure);
  if (!searchDeclared) tools.push(...native);

  const off = [...direct, ...(searchDeclared ? native : [])];
  const deferred = units.flatMap((unit): Deferred => {
    const names = unit.filter((name) => off.includes(name));

    return names.length > 1 ? [names] : names;
  });

  return { tools, deferred };
}

/** The tools to set after Pi restored the branch, or undefined to keep Pi's. */
function restoreTarget(
  latest: ReturnType<typeof latestEntry>,
  state: ToolState,
  { reload, previous, messages }: RestoreOptions,
  deny: readonly string[]
): string[] | undefined {
  if (!latest && !previous) return undefined;

  const message = getCurrentSystemMessage(messages());
  // Pi leaves the current tools unchanged when the destination has no tool record.
  if (!latest && message) return undefined;
  const recorded =
    latest && loadoutRecordedAfter(state.branch, latest.index)
      ? (message?.toolsAdded ?? []).map(({ name }) => name)
      : undefined;
  const { active } = state;
  const exposure = exposures(state.tools);
  const tools = latest
    ? restoredTools(latest.selection, {
        active,
        recorded,
        reload,
        exposure,
        ownsToolSearch: ownsToolSearch(state),
        searchDenied: toolMatcher(deny)(TOOL_SEARCH)
      })
    : baseTools(active, previous);

  // A call that turns off a tool also drops Pi's pending tools, such as MCP tools that are still connecting, so the tools are set only when they change.
  const changed =
    active.some((name) => !tools.includes(name)) ||
    tools.some((name) => exposure.has(name) && !active.includes(name));

  return changed ? tools : undefined;
}

type RestoreState = {
  active: readonly string[];
  /** Tools of the last request when a request followed the selection. */
  recorded: readonly string[] | undefined;
  /** `/reload`, which keeps the active tools and turns on `direct` extension tools again. */
  reload: boolean;
  exposure: ReadonlyMap<string, ToolExposure>;
  ownsToolSearch: boolean;
  /** Whether the selected profile's `deny` list names `tool_search`, so that it stays off. */
  searchDenied: boolean;
};

/**
 * The tools to declare after Pi restored a session. Pi declares the tools of the last request on resume, `/fork`, and `/tree`, which predate the selection when no request followed it. Pi also turns on the extension tools that the branch never recorded, as if they registered later. A tool that the selection knew is not new, so it stays off unless the last request declared it.
 */
function restoredTools(selection: Selection, state: RestoreState): string[] {
  const { recorded } = state;
  let tools: string[];
  if (state.reload) {
    const off = [...selection.base, ...selection.deferred.flat()].filter(
      (name) => !selection.tools.includes(name) && !recorded?.includes(name)
    );
    tools = state.active.filter((name) => !off.includes(name));
  } else if (recorded) {
    const known = new Set([...selection.base, ...selection.tools, ...selection.deferred.flat()]);
    tools = state.active.filter((name) => recorded.includes(name) || !known.has(name));
  } else tools = [...selection.tools];

  const searchDeclared = !state.searchDenied && declaresSearch(tools, state.exposure);

  // Without a declared `tool_search`, no deferred tool can load again. Without the extension's copy, deferred `direct` tools and groups still need restoration.
  if (!searchDeclared || !state.ownsToolSearch) {
    const unreachable = selection.deferred.flatMap((entry) =>
      typeof entry === "string" && searchDeclared
        ? [entry].filter((name) => isDirect(state.exposure.get(name)))
        : entryNames(entry).filter(
            (name) => state.exposure.has(name) && state.exposure.get(name) !== "hidden"
          )
    );
    tools.push(...unreachable.filter((name) => !tools.includes(name)));
  }

  return tools;
}

/** The switch notice's words for the change from `before` to `after`. */
function describeChange(
  before: readonly string[],
  after: readonly string[],
  deferred: ReadonlySet<string>
): string {
  const off = before.filter((name) => !after.includes(name));
  const parts = Object.entries({
    added: after.filter((name) => !before.includes(name)),
    removed: off.filter((name) => !deferred.has(name)),
    deferred: off.filter((name) => deferred.has(name))
  })
    .filter(([, names]) => names.length > 0)
    // Code unit order: Pi lists tools in registration order, which follows load order.
    .map(([change, names]) => `${change} ${[...names].sort().join(", ")}`);

  return parts.length > 0 ? `tools ${parts.join("; ")}` : "tools unchanged";
}
