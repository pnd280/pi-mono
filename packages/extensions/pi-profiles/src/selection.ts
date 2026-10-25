import type { SessionEntry, ToolExposure, ToolInfo } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

import type { Profile } from "./settings.ts";

export const SELECTION_ENTRY = "pi-profiles.selection";

/** Pi's tool that loads inactive tools. Pi does not export the name. */
export const TOOL_SEARCH = "tool_search";

const selectionSchema = z.object({
  /** Absent when no profile is selected. */
  name: z.string().optional(),
  /** Active tools without the profile; the next switch starts from them again. */
  base: z.array(z.string()),
  /** Active tools right after the switch. */
  tools: z.array(z.string()),
  /**
   * Tools that the profile deferred; `tool_search` can load them. The tools of an array are a
   * group, which loads together.
   */
  deferred: z.array(z.union([z.string(), z.array(z.string())]))
});

export type Selection = z.output<typeof selectionSchema>;

export type Deferred = Selection["deferred"];

/** The branch's latest valid selection and its position. */
export function latestSelection(
  branch: readonly SessionEntry[]
): { selection: Selection; index: number } | undefined {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry?.type !== "custom" || entry.customType !== SELECTION_ENTRY) continue;
    const parsed = selectionSchema.safeParse(entry.data);
    if (parsed.success) return { selection: parsed.data, index };
  }

  return undefined;
}

/**
 * Whether a request followed the selection at `index`, so that the transcript records its tools.
 * Pi adds a system message before a request that changes the tools or the prompt, and can omit it
 * when both stay, so a response also counts. Without either, the recorded tools predate the selection. A compaction
 * checkpoint copies the earlier record, so it does not count.
 */
export function loadoutRecordedAfter(branch: readonly SessionEntry[], index: number): boolean {
  return branch
    .slice(index + 1)
    .some(
      (entry) =>
        entry.type === "message" &&
        (entry.message.role === "system" || entry.message.role === "assistant")
    );
}

/** Tools the branch has called. */
export function usedTools(branch: readonly SessionEntry[]): Set<string> {
  return new Set(
    branch.flatMap((entry) =>
      entry.type === "message" && entry.message.role === "toolResult"
        ? [entry.message.toolName]
        : []
    )
  );
}

/**
 * Undoes `previous` on the active tools: drops the tools it added and restores the ones it
 * removed. Changes made since that switch, such as tools that `tool_search` loaded, are kept.
 */
export function baseTools(active: readonly string[], previous: Selection | undefined): string[] {
  if (!previous) return [...active];
  const added = previous.tools.filter((name) => !previous.base.includes(name));
  const removed = previous.base.filter((name) => !previous.tools.includes(name));

  return [
    ...active.filter((name) => !added.includes(name)),
    ...removed.filter((name) => !active.includes(name))
  ];
}

/**
 * Whether a tool name matches one of the entries: a name, or a pattern where `*` matches any
 * characters, as in Pi's `--tools`. Pi does not export its matcher.
 */
export function toolMatcher(entries: readonly string[]): (name: string) => boolean {
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

/**
 * Pi's own tools, such as `read` and `codemode`, have the source path `builtin:<name>`. Other tools
 * of Pi's built-in extensions, such as MCP tools, have the extension's path, such as `builtin:mcp`.
 */
const isPiTool = ({ name, sourceInfo }: Pick<ToolInfo, "name" | "sourceInfo">) =>
  sourceInfo.source === "builtin" && sourceInfo.path === `builtin:${name}`;

/**
 * The active tools without the `deny` matches, in a fixed order: Pi's own tools in the order of
 * `tools` (Pi's `getAllTools()`, which lists its core tools first, in Pi's order), then the other
 * tools by name. Pi activates extension tools in registration order, which follows load order.
 */
export function enforcedTools(
  active: readonly string[],
  deny: readonly string[],
  tools: readonly Pick<ToolInfo, "name" | "sourceInfo">[]
): string[] {
  const denied = toolMatcher(deny);
  const kept = new Set(active.filter((name) => !denied(name)));
  const own = tools.filter((tool) => isPiTool(tool) && kept.has(tool.name)).map(({ name }) => name);
  // Code unit order, so that the locale does not change it.
  const others = [...kept].filter((name) => !own.includes(name)).sort();

  return [...own, ...others];
}

/** The names of a `defer` entry: a name or pattern, or a group of them. */
export const entryNames = (entry: string | readonly string[]) =>
  typeof entry === "string" ? [entry] : entry;

/**
 * `names` with the rest of each deferred group whose tools it turns on, so that `tool_search`
 * loads a group's tools together.
 */
export function withGroups(
  names: readonly string[],
  active: readonly string[],
  deferred: Deferred
): string[] {
  const loading = names.filter((name) => !active.includes(name));
  const groups = deferred.filter(
    (entry) => typeof entry !== "string" && entry.some((name) => loading.includes(name))
  );

  return [...new Set([...names, ...groups.flat()])];
}

export type ToolState = {
  base: readonly string[];
  active: readonly string[];
  used: ReadonlySet<string>;
  exposure: ReadonlyMap<string, ToolExposure>;
  /** Whether the registered `tool_search` is the extension's, which also loads deferred tools. */
  ownsToolSearch: boolean;
};

/** Exposures that only the extension's `tool_search` can load while the tool is inactive. */
export const isDirect = (exposure: ToolExposure | undefined) =>
  exposure === "direct" || exposure === "model-only";

/**
 * Whether a `*` pattern in `allow` selects a tool that it matches. As Pi's `--tools` does, a pattern
 * turns on only `direct` and `model-only` tools, so `codemode` exposure stays. It also keeps the
 * base tools, such as `codemode` tools that `tool_search` loaded.
 */
export const allowPatternSelects = (
  name: string,
  exposure: ToolExposure | undefined,
  base: readonly string[]
) => isDirect(exposure) || base.includes(name);

/**
 * The candidates' deferral units. A tool belongs to the first `defer` entry that matches it. A group
 * entry makes one unit of its tools; a name or pattern makes a unit of each tool. `tool_search`,
 * unregistered tools, and `hidden` tools have no unit, so they stay.
 */
function deferUnits(
  candidates: readonly string[],
  defer: readonly (string | readonly string[])[],
  exposure: ReadonlyMap<string, ToolExposure>
): string[][] {
  const matchers = defer.map((entry) => toolMatcher(entryNames(entry)));
  const units = new Map<string | number, string[]>();

  for (const name of candidates) {
    const index = matchers.findIndex((matches) => matches(name));
    const tool = exposure.get(name);
    if (name === TOOL_SEARCH || tool === undefined || tool === "hidden" || index < 0) continue;
    const key = typeof defer[index] === "string" ? name : index;
    units.set(key, [...(units.get(key) ?? []), name]);
  }

  return [...units.values()];
}

/**
 * `allow` (or the base tools) without `deny`. A pattern in `allow` names the registered tools that
 * it matches and selects (see {@link allowPatternSelects}). A `defer` tool stays active when it is
 * active now and the branch has used it, or when no declared `tool_search` can load it again. Pi's
 * `tool_search` loads `codemode` and `deferred` tools; the extension's copy also loads `direct` and
 * `model-only` tools that a profile deferred, and a profile that defers them declares `tool_search`.
 * A group is deferred only as a whole, and only the extension's copy loads it together.
 */
export function profileTools(
  profile: Profile,
  state: ToolState
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
  const searchExposure = state.exposure.get(TOOL_SEARCH);
  const searchDeclared =
    searchExposure !== undefined && searchExposure !== "hidden" && tools.includes(TOOL_SEARCH);
  if (!searchDeclared) tools.push(...native);

  const off = [...direct, ...(searchDeclared ? native : [])];
  const deferred = units.flatMap((unit): Deferred => {
    const names = unit.filter((name) => off.includes(name));

    return names.length > 1 ? [names] : names;
  });

  return { tools, deferred };
}

export type RestoreState = {
  active: readonly string[];
  /** Tools of the last request when a request followed the selection. */
  recorded: readonly string[] | undefined;
  /** `/reload`, which keeps the active tools and turns on `direct` extension tools again. */
  reload: boolean;
  exposure: ReadonlyMap<string, ToolExposure>;
  ownsToolSearch: boolean;
};

/**
 * The tools to declare after Pi restored a session. Pi declares the tools of the last request on
 * resume, `/fork`, and `/tree`, which predate the selection when no request followed it. Pi also
 * turns on the extension tools that the branch never recorded, as if they registered later. A tool
 * that the selection knew is not new, so it stays off unless the last request declared it.
 */
export function restoredTools(selection: Selection, state: RestoreState): string[] {
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

  const searchExposure = state.exposure.get(TOOL_SEARCH);
  const searchDeclared =
    searchExposure !== undefined && searchExposure !== "hidden" && tools.includes(TOOL_SEARCH);

  // Without a declared `tool_search`, no deferred tool can load again. Without the extension's
  // copy, deferred `direct` tools and groups still need restoration.
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
