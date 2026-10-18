import type { ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import type { BrowserOptions, BrowserSection } from "@pi-mono/libs/tui/components/browser";
import { openBrowser } from "@pi-mono/libs/tui/open-browser";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";

import { entryNames, isDirect, TOOL_SEARCH, toolMatcher, type Deferred } from "./selection.ts";
import type { Profile } from "./settings.ts";

/** A configured profile, or `clear` for no profile. */
export interface ProfileChoice {
  name: string;
  profile: Profile | undefined;
  current: boolean;
  /**
   * The tool change that a switch would request now, in the words of the switch notice. Pi can
   * still leave out an MCP tool that a `--tools` list does not name.
   */
  change: string;
  /** False when the profile names a model that is unknown or has no credentials. */
  modelAvailable: boolean;
}

export interface MenuData {
  choices: readonly ProfileChoice[];
  /** The selected profile; undefined for no profile or a profile that is no longer configured. */
  profile: Profile | undefined;
  tools: readonly ToolInfo[];
  active: readonly string[];
  /** The latest selection's deferred tools. */
  deferred: Deferred;
  used: ReadonlySet<string>;
  ownsToolSearch: boolean;
}

const STATUSES = ["active", "deferred", "searchable", "off", "hidden"] as const;

type ToolStatus = (typeof STATUSES)[number];

/** Details are display-safe text, shown below the list. */
type MenuItem =
  | { kind: "profile"; choice: ProfileChoice; details: string }
  | { kind: "tool"; tool: ToolInfo; status: ToolStatus; details: string };

function toolStatus(tool: ToolInfo, data: MenuData): ToolStatus {
  if (tool.exposure === "hidden") return "hidden";
  if (data.active.includes(tool.name)) return "active";
  if (data.deferred.flat().includes(tool.name)) return "deferred";

  return isDirect(tool.exposure) ? "off" : "searchable";
}

/** Why the model can or cannot reach the tool now. */
function reach(tool: ToolInfo, status: ToolStatus, data: MenuData): string[] {
  if (status === "hidden") return ["Hidden: the model and codemode scripts cannot reach it."];
  if (status === "active")
    return [
      "Active in Pi's tool set.",
      "Its exposure and Pi's codemode mode decide whether the model can call it directly."
    ];
  if (status === "off") return ["Off: the model cannot call it or load it."];

  const lines = [
    status === "deferred" ? "Deferred by the profile." : "Not active in Pi's tool set."
  ];
  if (!data.active.includes(TOOL_SEARCH))
    lines.push("tool_search is not active, so the model cannot load it now.");
  // pi-profiles' `tool_search` alone finds deferred `direct` and `model-only` tools.
  else if (isDirect(tool.exposure) && !data.ownsToolSearch)
    lines.push("The active tool_search cannot load it.");
  else lines.push("The model can load it with tool_search.");
  if (tool.exposure === "codemode" || tool.exposure === "deferred")
    lines.push("Codemode scripts can call it while codemode is active.");
  const group = data.deferred.find(
    (entry) => typeof entry !== "string" && entry.includes(tool.name)
  );
  if (typeof group === "object")
    lines.push(`It loads together with ${group.filter((name) => name !== tool.name).join(", ")}.`);

  return lines;
}

/** Which of the selected profile's lists name the tool. The state above shows their effect. */
function profileRule(
  { name, exposure }: ToolInfo,
  { profile, ownsToolSearch }: MenuData
): string[] {
  if (!profile?.tools) return [];
  const { allow, deny = [], defer } = profile.tools;

  const allowRule = () => {
    if (!allow || !toolMatcher(allow)(name)) return "does not include it in allow";
    // As in Pi's `--tools`, a pattern does not turn on `codemode` or `deferred` tools.
    if (allow.includes(name) || isDirect(exposure)) return "includes it in allow";

    return "matches an allow pattern, which does not turn on codemode or deferred tools";
  };

  const denied = toolMatcher(deny)(name);
  // A tool belongs to the first `defer` entry that matches it.
  const entry = defer?.find((entry) => toolMatcher(entryNames(entry))(name));
  const lists = [
    allow && allowRule(),
    denied && "includes it in deny",
    entry !== undefined &&
      (typeof entry === "string" ? "includes it in defer" : "includes it in a defer group")
  ].filter((text) => typeof text === "string");
  const lines = lists.length > 0 ? [`Profile ${profile.name} ${lists.join(" and ")}.`] : [];
  if (typeof entry === "string")
    lines.push("A deferred tool stays active when the model called it on this branch.");
  else if (entry)
    lines.push(
      "A group is deferred only as a whole: it stays active when the model called one of its active tools on this branch."
    );
  if (name === TOOL_SEARCH && ownsToolSearch && !denied)
    lines.push("A profile activates it when it defers direct or model-only tools.");

  return lines;
}

type ToolItem = Extract<MenuItem, { kind: "tool" }>;

function toolItems(data: MenuData): ToolItem[] {
  const items = data.tools.map((tool) => {
    const status = toolStatus(tool, data);
    const details = [
      ...reach(tool, status, data),
      ...profileRule(tool, data),
      data.used.has(tool.name) ? "The model called it on this branch." : undefined,
      `Source: ${tool.sourceInfo.path}`,
      "",
      tool.description
    ]
      .filter((line) => line !== undefined)
      .join("\n");

    return { kind: "tool" as const, tool, status, details: displayText(details) };
  });

  // Group by status, in registration order within each group.
  return STATUSES.flatMap((status) => items.filter((item) => item.status === status));
}

function list(names: readonly string[] | undefined, absent: string): string {
  if (names === undefined) return absent;

  return names.length > 0 ? names.join(", ") : "none";
}

function profileDetails({ profile, change, modelAvailable }: ProfileChoice): string {
  if (!profile)
    return [
      "Undoes the current profile's tool changes and adds no system prompts. The model and thinking level stay.",
      "",
      `A switch now requests: ${change}`
    ].join("\n");

  const model = profile.model
    ? `${profile.model}${modelAvailable ? "" : " (unknown or no credentials, so the profile cannot apply)"}`
    : "unchanged";
  const thinking =
    profile.thinking ??
    (profile.model ? "not set; a model change applies Pi's setting" : "unchanged");

  return [
    `Model: ${model}`,
    `Thinking: ${thinking}`,
    `Allow: ${list(profile.tools?.allow, "the base tools")}`,
    `Deny: ${list(profile.tools?.deny, "none")}`,
    `Defer: ${list(
      profile.tools?.defer?.map((entry) =>
        typeof entry === "string" ? entry : `[${entry.join(", ")}]`
      ),
      "none"
    )}`,
    `A switch now requests: ${modelAvailable ? change : "nothing, because the profile cannot apply"}`,
    "",
    profile.prompts.length > 0 ? "Appended system prompts:" : "Appended system prompts: none",
    ...profile.prompts.flatMap((prompt, index) => (index === 0 ? [prompt] : ["", prompt]))
  ].join("\n");
}

function toolSummary(items: readonly ToolItem[], profile: Profile | undefined): string {
  const counts = STATUSES.map(
    (status) => [status, items.filter((item) => item.status === status).length] as const
  )
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`);

  return `${profile ? `Profile ${profile.name}` : "No profile"}: ${counts.join(", ") || "no tools"}`;
}

const searchText = (item: MenuItem) =>
  item.kind === "profile"
    ? `${item.choice.name} ${item.choice.profile?.description ?? "No profile"}`
    : `${item.tool.name} ${item.status} ${item.tool.exposure}`;

export interface MenuOptions {
  ui: ExtensionContext["ui"];
  signal: AbortSignal;
  data: MenuData;
  /** Runs after the menu closes, when the user chose a profile. */
  onSwitch(this: void, profile: Profile | undefined): Promise<void>;
  notify(this: void, message: string, type: "error" | "warning"): void;
}

/** A browser with the profiles and the current state of every tool, with details below the list. */
export async function openMenu({ ui, signal, data, onSwitch, notify }: MenuOptions): Promise<void> {
  let chosen: ProfileChoice | undefined;
  const profiles = data.choices.map((choice) => ({
    kind: "profile" as const,
    choice,
    details: displayText(profileDetails(choice))
  }));
  const tools = toolItems(data);
  const sections: BrowserSection<MenuItem>[] = [
    {
      id: "profiles",
      label: "Profiles",
      load: async () => ({ items: profiles }),
      confirm: {
        label: "switch",
        run: (item) => {
          if (item.kind === "profile") chosen = item.choice;

          return item.kind === "profile";
        }
      }
    },
    {
      id: "tools",
      label: "Tools",
      load: async () => ({ items: tools, message: toolSummary(tools, data.profile) })
    }
  ];
  const browser: BrowserOptions<MenuItem> = {
    sections,
    initialSection: "profiles",
    key: (item) =>
      item.kind === "profile" ? `profile:${item.choice.name}` : `tool:${item.tool.name}`,
    search: async (items, query, current) =>
      current() ? fuzzyFilter(items, query, searchText) : [],
    format: (items) => ({
      items: items.map((item) =>
        item.kind === "profile"
          ? {
              value: `profile:${item.choice.name}`,
              label: compactDisplayText(
                `${item.choice.name}${item.choice.current ? " (current)" : ""}`
              ),
              description: compactDisplayText(item.choice.profile?.description ?? "No profile")
            }
          : {
              value: `tool:${item.tool.name}`,
              label: compactDisplayText(item.tool.name),
              description: `${item.status}, ${item.tool.exposure}`
            }
      )
    }),
    details: (item) => item.details
  };

  await openBrowser({
    ui,
    signal,
    browser,
    onError: (error) =>
      notify(displayText(error instanceof Error ? error.message : String(error)), "error"),
    onInputRoutingUnavailable: () =>
      notify(
        "Fullscreen input routing is unavailable. Use regular mode if controls do not respond.",
        "warning"
      ),
    afterClose: () => (chosen && !signal.aborted ? onSwitch(chosen.profile) : undefined)
  });
}
