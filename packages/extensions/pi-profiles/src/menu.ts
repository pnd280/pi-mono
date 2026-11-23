import type { ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import {
  openBrowser,
  type BrowserOptions,
  type BrowserSection
} from "@pi-mono/libs/tui/open-browser";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { errorMessage } from "@pi-mono/utils/errors";

import { overriddenServers, presetConflict, presetSummary } from "./presets.ts";
import type { ToolReport } from "./selection.ts";
import type { McpPreset, Profile } from "./settings.ts";

/** A configured profile, or `clear` for no profile. */
export type ProfileChoice = {
  name: string;
  profile: Profile | undefined;
  current: boolean;
  /** The tool change that a switch would request now, from the switch's own plan. */
  change: string;
  /** False when the profile names a model that is unknown or has no credentials. */
  modelAvailable: boolean;
};

export type MenuData = {
  choices: readonly ProfileChoice[];
  /** The selected profile; undefined for no profile or a profile that is no longer configured. */
  profile: Profile | undefined;
  /** Every registered tool, in registration order. */
  tools: readonly ToolReport[];
};

type ToolStatus = ToolReport["status"];

const STATUSES: readonly ToolStatus[] = ["active", "deferred", "searchable", "off", "hidden"];

/** Details are display-safe text, shown below the list. */
type MenuItem =
  | { kind: "profile"; choice: ProfileChoice; details: string }
  | { kind: "tool"; tool: ToolInfo; status: ToolStatus; details: string };

/** Why the model can or cannot reach the tool now. */
function reach({ tool, status, search, group }: ToolReport): string[] {
  if (status === "hidden") return ["Hidden: the model and codemode scripts cannot reach it."];
  if (status === "active")
    return [
      "Active in Pi's tool set.",
      "Its exposure and Pi's codemode mode decide whether the model can call it directly."
    ];

  // Codemode scripts call inactive `codemode` and `deferred` tools. Such a tool is off only when the profile denies it, so that pi-profiles' tool_search leaves it out.
  const scripted = tool.exposure === "codemode" || tool.exposure === "deferred";

  if (status === "off") {
    if (!scripted) return ["Off: the model cannot call it or load it."];

    return [
      "Off: the profile denies it, so pi-profiles' tool_search cannot load it.",
      "Codemode scripts can call it while codemode is active."
    ];
  }

  const lines = [
    status === "deferred" ? "Deferred by the profile." : "Not active in Pi's tool set."
  ];
  if (search === "inactive")
    lines.push("tool_search is not active, so the model cannot load it now.");
  else if (search === "cannot") lines.push("The active tool_search cannot load it.");
  else lines.push("The model can load it with tool_search.");
  if (scripted) lines.push("Codemode scripts can call it while codemode is active.");
  if (group && group.length > 0) lines.push(`It loads together with ${group.join(", ")}.`);

  return lines;
}

const ALLOW_TEXT = {
  selects: "includes it in allow",
  unlisted: "does not include it in allow",
  pattern: "matches an allow pattern, which turns on only direct and model-only tools"
} as const;

/** Which of the selected profile's lists name the tool. The state above shows their effect. */
function profileRule({ lists }: ToolReport, profile: Profile | undefined): string[] {
  if (!lists || !profile) return [];

  const texts = [
    lists.allow && ALLOW_TEXT[lists.allow],
    lists.deny && "includes it in deny",
    lists.defer &&
      (lists.defer === "name" ? "includes it in defer" : "includes it in a defer group")
  ].filter((text) => typeof text === "string");
  const lines = texts.length > 0 ? [`Profile ${profile.name} ${texts.join(" and ")}.`] : [];
  if (lists.defer === "name")
    lines.push("A deferred tool stays active when the model called it on this branch.");
  else if (lists.defer === "group")
    lines.push(
      "A group is deferred only as a whole: it stays active when the model called one of its active tools on this branch."
    );
  if (lists.activatesSearch)
    lines.push("A profile activates it when it defers direct or model-only tools.");

  return lines;
}

type ToolItem = Extract<MenuItem, { kind: "tool" }>;

function toolItems(data: MenuData): ToolItem[] {
  const items = data.tools.map((report) => {
    const { tool, status } = report;
    const details = [
      `Tool: ${tool.name}`,
      `State: ${status}, exposure ${tool.exposure}`,
      ...reach(report),
      ...profileRule(report, data.profile),
      report.used ? "The model called it on this branch." : undefined,
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

function profileDetails({ name, current, profile, change, modelAvailable }: ProfileChoice): string {
  const identity = `Profile: ${name}${current ? " (current)" : ""}`;
  if (!profile)
    return [
      identity,
      "Undoes the current profile's tool changes, stops its MCP servers, and adds no system prompts. The model, thinking level, and active MCP presets stay.",
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
    identity,
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
    `MCP servers: ${list(profile.mcpServers && Object.keys(profile.mcpServers), "none")}`,
    `MCP presets: ${
      profile.mcpPresets?.length === 0
        ? "none; a switch turns off the active presets"
        : list(profile.mcpPresets, "unchanged")
    }`,
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

export type MenuOptions = {
  ui: ExtensionContext["ui"];
  signal: AbortSignal;
  data: MenuData;
  /** Runs after the menu closes, when the user chose a profile. */
  onSwitch(this: void, profile: Profile | undefined): Promise<void>;
  notify(this: void, message: string, type: "error" | "warning"): void;
};

export type PresetMenuOptions = {
  ui: ExtensionContext["ui"];
  signal: AbortSignal;
  /** The configured presets, in settings declaration order. */
  presets: readonly McpPreset[];
  /** The active presets and the selected profile now, read at each render. */
  state(this: void): { active: readonly McpPreset[]; profile: Profile | undefined };
  /** Turns the preset on or off at once, and leaves the menu open. */
  onToggle(this: void, preset: McpPreset): void;
  notify(this: void, message: string, type: "error" | "warning"): void;
};

function presetDetails(
  preset: McpPreset,
  { active, profile }: ReturnType<PresetMenuOptions["state"]>
): string {
  const on = active.includes(preset);
  const conflict = on ? undefined : presetConflict(preset, active);
  const overridden = overriddenServers([preset], profile?.mcpServers);

  // The state lines come first: the details pane cuts the rows that do not fit, such as a long description.
  return [
    `MCP preset: ${preset.name}`,
    `State: ${on ? "on" : "off"}`,
    conflict &&
      `Cannot turn on: its server ${conflict.server} clashes with server ${conflict.other} of active preset ${conflict.preset.name}.`,
    profile && overridden.length > 0
      ? `${on ? "Replaces" : "Would replace"} servers of profile ${profile.name}: ${overridden.join(", ")}`
      : undefined,
    `Scope: ${preset.scope}`,
    `MCP servers: ${Object.keys(preset.mcpServers).join(", ")}`,
    preset.description === undefined ? undefined : `Description: ${preset.description}`
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

/** A browser that turns presets on and off in place; the rows and details show the state after each toggle. */
export async function openPresetMenu({
  ui,
  signal,
  presets,
  state,
  onToggle,
  notify
}: PresetMenuOptions): Promise<void> {
  const browser: BrowserOptions<McpPreset> = {
    sections: [
      {
        id: "presets",
        label: "MCP presets",
        load: async () => ({ items: [...presets] }),
        confirm: {
          label: "toggle",
          // False keeps the browser open; its next render reads the new state.
          run: (preset) => {
            onToggle(preset);

            return false;
          }
        }
      }
    ],
    initialSection: "presets",
    key: (preset) => preset.name,
    search: async (items, query, current) =>
      current()
        ? fuzzyFilter(items, query, (preset) => `${preset.name} ${presetSummary(preset)}`)
        : [],
    format: (items) => {
      const { active } = state();

      return {
        items: items.map((preset) => ({
          value: preset.name,
          label: compactDisplayText(`[${active.includes(preset) ? "x" : " "}] ${preset.name}`),
          description: compactDisplayText(presetSummary(preset))
        }))
      };
    },
    details: (preset) => displayText(presetDetails(preset, state())),
    // Ctrl+P shows the details that the pane cuts.
    preview: (preset) => ({ text: displayText(presetDetails(preset, state())) })
  };

  await openBrowser({
    ui,
    signal,
    browser,
    onError: (error) => notify(displayText(errorMessage(error)), "error"),
    onInputRoutingUnavailable: () =>
      notify(
        "Fullscreen input routing is unavailable. Use regular mode if controls do not respond.",
        "warning"
      )
  });
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
    onError: (error) => notify(displayText(errorMessage(error)), "error"),
    onInputRoutingUnavailable: () =>
      notify(
        "Fullscreen input routing is unavailable. Use regular mode if controls do not respond.",
        "warning"
      ),
    afterClose: () => (chosen && !signal.aborted ? onSwitch(chosen.profile) : undefined)
  });
}
