import {
  createToolSearchExtension,
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type McpServerConfig,
  type SessionStartEvent,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";
import { joinPromptParts } from "@pi-mono/libs/prompt-parts";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { errorMessage } from "@pi-mono/utils/errors";
import { splitModelReference } from "@pi-mono/utils/model-reference";

import { labelBorder } from "./editor-label.ts";
import type { MenuData } from "./menu.ts";
import {
  CLEAR,
  effectiveServers,
  latestPresets,
  parsePresetsFlag,
  planServers,
  PRESETS_ENTRY,
  presetsEntry,
  presetSummary,
  profilePresets,
  restorePresets,
  togglePreset,
  type PresetsEntry
} from "./presets.ts";
import {
  enforcedTools,
  latestSelection,
  planRestore,
  planSwitch,
  profileNotice,
  reportTools,
  RUN_ENTRY,
  runRecord,
  searchableTools,
  selectedProfile,
  SELECTION_ENTRY,
  withGroups,
  type Rules,
  type Selection
} from "./selection.ts";
import { loadProfiles, type McpPreset, type Profile, type ProfileConfig } from "./settings.ts";

const ID = "pi-profiles";
/** The footer status that lists the active MCP presets; pi-editor-widgets shows it as `status:pi-profiles.mcp-presets`. */
const PRESETS_STATUS = "pi-profiles.mcp-presets";
/** After pi-model-prompt (`100`), so the profile's prompts follow the model's text. */
const PROMPT_RANK = 200;
/** After pi-nested-instructions (`100`), so the selection entry follows its startup messages. */
const STARTUP_RANK = 200;

// The menu and its shared TUI components load on first use, not at startup. Concurrent opens share one import: under jiti a concurrent import can return a partly evaluated module.
const importMenu = () => import("./menu.ts");
let menuModule: ReturnType<typeof importMenu> | undefined;
const loadMenu = () => (menuModule ??= importMenu());

/**
 * How a switch changes the active presets: to the profile's `mcpPresets` when it has them, not at all, or to the given presets.
 */
type PresetPolicy = { kind: "profile" } | { kind: "keep" } | { kind: "set"; presets: McpPreset[] };

const PROFILE_PRESETS: PresetPolicy = { kind: "profile" };

/** Without a UI, errors go to stderr, so a run with an unusable `--profile` does not fail silently. */
function reportError(ctx: ExtensionContext, message: string): void {
  const text = displayText(message);
  if (ctx.hasUI) ctx.ui.notify(text, "error");
  else console.error(text);
}

export default async function profiles(pi: ExtensionAPI): Promise<void> {
  const prompt = joinPromptParts(pi, { id: ID });
  const lifecycle = joinLifecycle(pi, { id: ID });
  let config: ProfileConfig | undefined;
  /** The latest selection's deferred tools and `deny` list, in force until the next selection. */
  let rules: Rules = { deferred: [], deny: [] };
  /** Identifies the extension's `tool_search` in `pi.getAllTools()`. */
  let searchReach: ToolInfo["reachesTools"];
  /** Aborted when the session ends, so an open menu closes and no new switch starts. */
  let session = new AbortController();
  /** The switch in progress. Requests, navigation, and the end of the session wait for it. */
  let switching: Promise<void> | undefined;
  /** The outgoing selection, for a tree destination that has no selection or tool record. */
  let treeSelection: Selection | undefined;
  /**
   * The MCP servers that the extension registered, by name. Pi loads the extension again with each session and on `/reload`, and drops the registrations of the previous load.
   */
  const servers = new Map<string, McpServerConfig>();
  /** The active MCP presets, in settings declaration order. The branch's latest presets entry saves them. */
  let presets: McpPreset[] = [];

  // Registering a `tool_search` while loading makes Pi skip its built-in one. This copy of Pi's tool sees the profile's deferred tools as `deferred`, so it loads them with their whole groups. Always register it: loading extensions get no trust decision, so settings cannot show whether a project profile defers tools.
  await createToolSearchExtension()({
    ...pi,
    getAllTools: () => searchableTools(pi.getAllTools(), rules),
    setActiveTools: (names) => pi.setActiveTools(withGroups(names, pi.getActiveTools(), rules)),
    registerTool: (tool) => {
      searchReach = tool.reachesTools;
      pi.registerTool(tool);
    }
  });

  pi.registerFlag("profile", {
    description: `Profile for this run, or ${CLEAR} for no profile`,
    type: "string"
  });

  pi.registerFlag("mcp-presets", {
    description: `MCP presets for this run (comma-separated), or ${CLEAR} for none`,
    type: "string"
  });

  /** The Pi state that the selection plans read. */
  const toolState = (ctx: ExtensionContext) => ({
    branch: ctx.sessionManager.getBranch(),
    active: pi.getActiveTools(),
    tools: pi.getAllTools(),
    searchReach
  });

  /** The selected profile's name, which the editor shows in its top border. */
  let label: string | undefined;
  let requestRender: (() => void) | undefined;

  const showLabel = (name: string | undefined) => {
    label = name === undefined ? undefined : compactDisplayText(name);
    requestRender?.();
  };

  /** Adds the label to the editor that Pi or an earlier extension would show. */
  function labelEditor(ctx: ExtensionContext): void {
    const previous = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      // Like Pi's own editor, it draws the working status in its top border.
      const editor =
        previous?.(tui, theme, keybindings) ??
        new CustomEditor(tui, theme, keybindings, { embedWorkingStatus: true });
      const render = editor.render.bind(editor);

      editor.render = (width) => {
        const lines = render(width);
        const [top, ...rest] = lines;
        if (label === undefined || top === undefined) return lines;

        return [labelBorder(top, label, (text) => editor.borderColor?.(text) ?? text), ...rest];
      };

      requestRender = () => tui.requestRender();

      return editor;
    });
  }

  const currentSelection = (ctx: ExtensionContext) =>
    latestSelection(ctx.sessionManager.getBranch());
  /**
   * Whether the choice, a profile or no profile, is the selection. A selection whose profile the settings no longer supply matches no choice, also not a profile of the same name.
   */
  const isCurrent = (choice: Profile | undefined, selection: Selection | undefined) =>
    choice ? selectedProfile(selection, [choice]) !== undefined : selection?.name === undefined;
  const findProfile = (name: string | undefined) =>
    config?.profiles.find((profile) => profile.name === name);
  /** The selection's profile, when the current settings still supply it. */
  const selected = (selection: Selection | undefined) =>
    selectedProfile(selection, config?.profiles ?? []);

  /** What a `/profile` or `--profile` argument selects: a profile, or none for `clear`. */
  const choose = (name: string): { profile: Profile | undefined } | undefined => {
    if (name === CLEAR) return { profile: undefined };
    const profile = findProfile(name);

    return profile && { profile };
  };

  /** The model of a profile, when it is known and has credentials. */
  function profileModel(reference: string, ctx: ExtensionContext) {
    const { provider, id } = splitModelReference(reference);
    const model = ctx.modelRegistry.find(provider, id);

    return model && ctx.modelRegistry.hasConfiguredAuth(model) ? model : undefined;
  }

  /** Makes the presets active and shows them in the footer, without saving them. */
  function showPresets(active: McpPreset[], ctx: ExtensionContext): void {
    presets = active;
    if (ctx.mode !== "tui") return;
    const names = active.map(({ name }) => name).join(", ");
    ctx.ui.setStatus(
      PRESETS_STATUS,
      active.length > 0 ? ctx.ui.theme.fg("dim", compactDisplayText(`MCP: ${names}`)) : undefined
    );
  }

  /** Saves the presets on the branch and makes them active. The caller registers their servers. */
  function savePresets(active: McpPreset[], ctx: ExtensionContext): void {
    pi.appendEntry<PresetsEntry>(PRESETS_ENTRY, presetsEntry(active));
    showPresets(active, ctx);
  }

  /** Makes the branch's saved presets active, without saving them. Returns the restoration's warnings. */
  function restorePresetsOf(
    ctx: ExtensionContext,
    saved = latestPresets(ctx.sessionManager.getBranch())
  ): string[] {
    const restored = restorePresets(saved, config?.mcpPresets ?? []);
    showPresets(restored.active, ctx);

    return restored.warnings;
  }

  /**
   * Registers the profile's and the active presets' MCP servers, and unregisters the others, so that only those servers connect. A server that Pi refuses is left out, with an error.
   */
  function selectServers(profile: Profile | undefined, ctx: ExtensionContext): void {
    const plan = planServers(servers, effectiveServers(profile?.mcpServers, presets));

    for (const name of plan.unregister) {
      pi.unregisterMcpServer(name);
      servers.delete(name);
    }

    for (const [name, config] of plan.register) {
      try {
        pi.registerMcpServer(name, config);
        servers.set(name, config);
      } catch (error) {
        reportError(ctx, `pi-profiles: MCP server ${name} not registered: ${errorMessage(error)}`);
      }
    }
  }

  /**
   * Without a profile, the model and thinking level stay, and the previous profile's tool changes and MCP servers are undone. `source` prefixes notices for switches that the user did not request. `presetPolicy` decides the active presets, which follow the profile's `mcpPresets` unless startup keeps the saved presets or applies `--mcp-presets`. Resolves whether the profile applied.
   */
  async function switchTo(
    profile: Profile | undefined,
    ctx: ExtensionContext,
    source = "",
    presetPolicy = PROFILE_PRESETS
  ): Promise<boolean> {
    if (session.signal.aborted) return false;

    if (!ctx.isIdle() || switching) {
      ctx.ui.notify(
        "Profiles cannot change while the agent runs or another switch is in progress",
        "warning"
      );

      return false;
    }

    let applied = false;
    switching = apply(profile, ctx, source, presetPolicy)
      .then((result) => {
        applied = result;
      })
      .finally(() => {
        switching = undefined;
      });
    // A run that starts now builds its prompt after the switch, with the profile and its model.
    prompt.hold(switching);
    await switching;

    return applied;
  }

  async function apply(
    profile: Profile | undefined,
    ctx: ExtensionContext,
    source: string,
    presetPolicy: PresetPolicy
  ): Promise<boolean> {
    if (profile?.model) {
      const model = profileModel(profile.model, ctx);
      const current = ctx.model?.provider === model?.provider && ctx.model?.id === model?.id;
      // `setModel` checks the credentials again, and throws before it changes anything without them.
      const usable =
        model !== undefined && (current || (await pi.setModel(model).catch(() => false)));

      if (!usable) {
        reportError(
          ctx,
          `${source}Profile ${profile.name} not applied: ${profile.model} is unavailable or has no credentials`
        );

        return false;
      }
    }

    if (profile?.thinking) pi.setThinkingLevel(profile.thinking);

    const plan = planSwitch(profile, toolState(ctx));
    pi.setActiveTools(plan.tools);
    const result = plan.settle(pi.getActiveTools());
    rules = result.rules;
    pi.appendEntry<Selection>(SELECTION_ENTRY, result.entry);
    // A profile without `mcpPresets`, and no profile, keep the active presets.
    let active: McpPreset[] | undefined;
    if (presetPolicy.kind === "set") active = presetPolicy.presets;
    else if (presetPolicy.kind === "profile")
      active = profilePresets(profile, config?.mcpPresets ?? []);
    if (active) savePresets(active, ctx);
    // After the tools: a call that turns off a restored tool drops the pending tools of connecting servers.
    selectServers(profile, ctx);
    showLabel(profile?.name);
    const title = profile ? `Profile ${profile.name}` : "No profile";
    ctx.ui.notify(displayText(`${source}${title}: ${result.change}`), "info");

    return true;
  }

  function restoreTools(
    ctx: ExtensionContext,
    reload: boolean,
    previous?: Selection
  ): Selection | undefined {
    const plan = planRestore(toolState(ctx), {
      reload,
      previous,
      profiles: config?.profiles ?? [],
      messages: () => ctx.sessionManager.buildSessionProjection().messages
    });
    rules = plan.rules;
    showLabel(selected(plan.selection)?.name);
    if (plan.tools) pi.setActiveTools(plan.tools);

    return plan.selection;
  }

  /** The presets that a valid `--mcp-presets` value turns on. Only startup reports an invalid value. */
  function flagPresets(
    reason: SessionStartEvent["reason"],
    loaded: ProfileConfig,
    ctx: ExtensionContext
  ): McpPreset[] | undefined {
    const flag = pi.getFlag("mcp-presets");
    if (typeof flag !== "string") return undefined;
    const parsed = parsePresetsFlag(flag, loaded.mcpPresets);
    if ("presets" in parsed) return parsed.presets;
    if (reason === "startup")
      reportError(
        ctx,
        `--mcp-presets ignored: ${parsed.error}; use comma-separated preset names or ${CLEAR}`
      );

    return undefined;
  }

  /**
   * The profile that `--profile` or the default profile switches to when the session starts, if any. `replacesSaved` is true for `--profile` when Pi starts, which replaces the branch's saved state.
   */
  function startTarget(
    reason: SessionStartEvent["reason"],
    selection: Selection | undefined,
    loaded: ProfileConfig,
    ctx: ExtensionContext
  ): { profile: Profile | undefined; source: string; replacesSaved: boolean } | undefined {
    const flag = pi.getFlag("profile");
    const requested = typeof flag === "string" ? choose(flag) : undefined;
    if (typeof flag === "string" && !requested && reason === "startup")
      reportError(ctx, `--profile names no configured profile; use a profile name or ${CLEAR}`);

    // Only when Pi starts does `--profile` replace a selection. Later sessions in the run, such as after /new, keep theirs, and use `--profile` in place of the default profile.
    if (requested && (reason === "startup" || !selection))
      return { profile: requested.profile, source: "", replacesSaved: reason === "startup" };

    if (!selection) {
      // Print, JSON, and RPC runs, such as subagents, apply no default profile, so a branch without a selection keeps the model and tools it was given.
      return ctx.mode === "tui" && loaded.defaultProfile
        ? { profile: loaded.defaultProfile, source: "pi-profiles: ", replacesSaved: false }
        : undefined;
    }

    if (selection.name !== undefined && !selected(selection))
      ctx.ui.notify("pi-profiles: the selected profile is no longer configured", "warning");

    return undefined;
  }

  /**
   * Restores the session's selection and presets, then applies `--profile` or the default profile, and `--mcp-presets`.
   */
  async function startProfile(
    reason: SessionStartEvent["reason"],
    loaded: ProfileConfig,
    ctx: ExtensionContext
  ): Promise<void> {
    const selection = restoreTools(ctx, reason === "reload");
    const saved = latestPresets(ctx.sessionManager.getBranch());
    const savedPresets = saved !== undefined;
    const presetWarnings = restorePresetsOf(ctx, saved);
    const target = startTarget(reason, selection, loaded, ctx);
    // Like `--profile`, `--mcp-presets` replaces saved presets only when Pi starts.
    const flagged =
      reason === "startup" || !savedPresets ? flagPresets(reason, loaded, ctx) : undefined;

    // `--mcp-presets` takes the place of the profile's `mcpPresets`, so their servers never connect. Only `--profile` when Pi starts replaces the saved presets with the profile's: the default profile, and `--profile` in a later session, keep them.
    let policy: PresetPolicy = PROFILE_PRESETS;
    if (flagged !== undefined) policy = { kind: "set", presets: flagged };
    else if (savedPresets && !target?.replacesSaved) policy = { kind: "keep" };
    const applied = target ? await switchTo(target.profile, ctx, target.source, policy) : false;
    // A profile that cannot apply leaves `--mcp-presets` in force.
    if (!applied && flagged !== undefined) savePresets(flagged, ctx);
    const replaced =
      flagged !== undefined ||
      (applied && policy.kind === "profile" && target?.profile?.mcpPresets !== undefined);
    if (!replaced)
      for (const warning of presetWarnings) ctx.ui.notify(`pi-profiles: ${warning}`, "warning");

    // A switch registers its profile's and presets' servers. Otherwise the restored selection's servers register.
    if (!applied) selectServers(selected(selection), ctx);
  }

  // Startup and /reload both start a session, so edited settings apply after /reload.
  lifecycle.onSessionStart((event, ctx, arrival) => {
    session = new AbortController();
    const loaded = loadProfiles({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });
    config = loaded;

    for (const warning of loaded.warnings) ctx.ui.notify(`pi-profiles: ${warning}`, "warning");

    if (loaded.profiles.length > 0) {
      arrival.claimShortcut(loaded.shortcut, {
        description: "Switch to the next profile, or to no profile after the last",
        handler: async (shortcutCtx) => {
          const cycle = [...loaded.profiles, undefined];
          const selection = currentSelection(shortcutCtx);
          const index = cycle.findIndex((choice) => isCurrent(choice, selection));
          await switchTo(cycle[(index + 1) % cycle.length], shortcutCtx);
        }
      });
      if (ctx.mode === "tui") labelEditor(ctx);
    }

    // Commits run in the first participant's `resources_discover` handler, which Pi emits after every extension's `session_start` handler, so the tools that they register are known, and the selection entry follows pi-nested-instructions' startup messages (`100`).
    arrival.commit(STARTUP_RANK, () => startProfile(event.reason, loaded, ctx));
  });

  pi.on("session_before_tree", async (_event, ctx) => {
    // Save the selection on its original branch before Pi moves the leaf.
    await switching;
    treeSelection = latestSelection(ctx.sessionManager.getBranch());
  });

  pi.on("session_tree", (_event, ctx) => {
    const selection = restoreTools(ctx, false, treeSelection);
    treeSelection = undefined;
    for (const warning of restorePresetsOf(ctx))
      ctx.ui.notify(`pi-profiles: ${warning}`, "warning");
    selectServers(selected(selection), ctx);
  });

  pi.on("session_before_switch", async () => {
    // A same-file resume must read the selection saved by the completed switch.
    await switching;
  });

  // Before any extension awaits its shutdown work, no new switch starts and the menu closes. The switch in progress still saves its selection.
  lifecycle.onSessionShutdown(
    () => session.abort(),
    async (_event, ctx) => {
      await switching;
      if (ctx.mode === "tui") ctx.ui.setStatus(PRESETS_STATUS, undefined);
    }
  );

  // The coordinator calls parts after every hold, such as a switch, has settled.
  prompt.part(PROMPT_RANK, (ctx) => selected(currentSelection(ctx))?.prompts.join("\n\n"));

  /**
   * Turns off the selection's `deny` tools, which other extensions, `tool_search`, or `--tools` can turn on again. Sets the tools only when a `deny` tool is active.
   */
  function enforceTools(): void {
    const tools = enforcedTools(pi.getActiveTools(), rules);
    if (tools) pi.setActiveTools(tools);
  }

  // The run's first request declares the tools that are active when before_agent_start ends.
  pi.on("before_agent_start", async (_event, ctx) => {
    // A run that starts during a switch uses the profile's tools.
    await switching;
    enforceTools();
    const message = profileNotice(ctx.sessionManager.getBranch(), config?.profiles ?? []);

    return message && { message };
  });

  // A later request declares the tools that are active when the previous turn ends. Pi takes them before turn_start, so a change in turn_start reaches only the request after.
  pi.on("turn_end", (event, ctx) => {
    enforceTools();
    // After the turn's response, so the record leaves the branch with the run, as on `/tree` to its prompt.
    const data = runRecord(ctx.sessionManager.getBranch(), config?.profiles ?? []);

    return data && { entries: [...event.entries, { type: "custom", customType: RUN_ENTRY, data }] };
  });

  /** The configured profiles, then `clear` for no profile. */
  const choices = () => [
    ...(config?.profiles ?? []).map((profile) => ({
      name: profile.name,
      description: compactDisplayText(profile.description),
      profile
    })),
    { name: CLEAR, description: "No profile", profile: undefined }
  ];

  /** The profiles, with the change that each switch would make now, and the state of every tool. */
  function menuData(ctx: ExtensionContext): MenuData {
    const state = toolState(ctx);
    const selection = latestSelection(state.branch);
    const profile = selected(selection);
    const choices = [...(config?.profiles ?? []), undefined].map((choice) => ({
      name: choice?.name ?? CLEAR,
      profile: choice,
      current: isCurrent(choice, selection),
      change: planSwitch(choice, state).change,
      modelAvailable: !choice?.model || profileModel(choice.model, ctx) !== undefined
    }));

    return { choices, profile, tools: reportTools(state, rules, profile) };
  }

  pi.registerCommand("profile", {
    description: "Switch profile",
    getArgumentCompletions: (prefix) => {
      const typed = prefix.trim();
      const list = choices();
      // An exact argument must submit, rather than accepting an identical completion first.
      if (list.some(({ name }) => name === typed)) return null;

      return list
        .filter(({ name }) => name.startsWith(typed))
        .map(({ name, description }) => ({ value: name, label: name, description }));
    },
    handler: async (args, ctx) => {
      let name = args.trim();

      // `clear` still undoes a selection after its profiles were removed from settings.
      if ((config?.profiles ?? []).length === 0 && name !== CLEAR) {
        ctx.ui.notify("No profiles are configured", "warning");

        return;
      }

      if (name === "" && ctx.mode === "tui") {
        // Read before the import: the session can end while the menu loads.
        const { ui } = ctx;
        const { signal } = session;

        const { openMenu } = await loadMenu();
        if (signal.aborted) return;
        await openMenu({
          ui,
          signal,
          data: menuData(ctx),
          onSwitch: async (profile) => {
            await switchTo(profile, ctx);
          },
          notify: (message, type) => ui.notify(message, type)
        });

        return;
      }

      if (name === "" && ctx.hasUI) {
        const list = choices();
        const selection = currentSelection(ctx);
        const options = list.map(
          (choice) =>
            `${choice.name}${isCurrent(choice.profile, selection) ? " (current)" : ""}: ${choice.description}`
        );
        const choice = await ctx.ui.select("Profile", options);
        if (choice === undefined) return;
        name = list[options.indexOf(choice)]?.name ?? "";
      }

      const choice = choose(name);
      if (choice) await switchTo(choice.profile, ctx);
      else
        ctx.ui.notify(
          `Usage: /profile <name> or /profile ${CLEAR}; no profile has that name`,
          "error"
        );
    }
  });

  /** Like a switch, a preset change is refused while the agent runs or a switch is in progress. */
  function canChangePresets(ctx: ExtensionContext): boolean {
    if (session.signal.aborted) return false;
    if (ctx.isIdle() && !switching) return true;
    ctx.ui.notify(
      "MCP presets cannot change while the agent runs or a profile switch is in progress",
      "warning"
    );

    return false;
  }

  /** Saves the presets and registers the servers of the selected profile and the presets. */
  function changePresets(active: McpPreset[], ctx: ExtensionContext): void {
    savePresets(active, ctx);
    selectServers(selected(currentSelection(ctx)), ctx);
  }

  const activeNames = () =>
    presets.length > 0 ? presets.map(({ name }) => name).join(", ") : "none";

  /** Turns the preset on or off, unless it clashes with an active preset. */
  function toggle(preset: McpPreset, ctx: ExtensionContext): void {
    if (!canChangePresets(ctx)) return;
    const result = togglePreset(preset, presets, config?.mcpPresets ?? []);

    if (!result.active) {
      const { conflict } = result;
      ctx.ui.notify(
        displayText(
          `MCP preset ${preset.name} not turned on: its server ${conflict.server} clashes with server ${conflict.other} of active preset ${conflict.preset.name}. Turn that preset off first.`
        ),
        "warning"
      );

      return;
    }

    changePresets(result.active, ctx);
    ctx.ui.notify(
      displayText(
        `MCP preset ${preset.name} ${result.enabled ? "on" : "off"}; active presets: ${activeNames()}`
      ),
      "info"
    );
  }

  function clearPresets(ctx: ExtensionContext): void {
    if (!canChangePresets(ctx)) return;
    changePresets([], ctx);
    ctx.ui.notify("MCP presets cleared", "info");
  }

  /** The configured presets, then `clear` for none. */
  const presetChoices = () => [
    ...(config?.mcpPresets ?? []).map((preset) => ({
      name: preset.name,
      description: compactDisplayText(presetSummary(preset)),
      preset
    })),
    { name: CLEAR, description: "No MCP presets", preset: undefined }
  ];

  pi.registerCommand("mcp-presets", {
    description: "Turn MCP presets on or off",
    getArgumentCompletions: (prefix) => {
      const typed = prefix.trim();
      const list = presetChoices();
      // An exact argument must submit, rather than accepting an identical completion first.
      if (list.some(({ name }) => name === typed)) return null;

      return list
        .filter(({ name }) => name.startsWith(typed))
        .map(({ name, description }) => ({ value: name, label: name, description }));
    },
    handler: async (args, ctx) => {
      let name = args.trim();
      const all = config?.mcpPresets ?? [];

      // `clear` still turns off presets after they were removed from settings.
      if (all.length === 0 && name !== CLEAR) {
        ctx.ui.notify("No MCP presets are configured", "warning");

        return;
      }

      if (name === "" && ctx.mode === "tui") {
        // Read before the import: the session can end while the menu loads.
        const { ui } = ctx;
        const { signal } = session;

        const { openPresetMenu } = await loadMenu();
        await openPresetMenu({
          ui,
          signal,
          presets: all,
          state: () => ({ active: presets, profile: selected(currentSelection(ctx)) }),
          onToggle: (preset) => toggle(preset, ctx),
          notify: (message, type) => ui.notify(message, type)
        });

        return;
      }

      if (name === "" && ctx.hasUI) {
        const list = presetChoices();
        const options = list.map(({ name: choice, description, preset }) =>
          preset
            ? `[${presets.includes(preset) ? "x" : " "}] ${choice}: ${description}`
            : `${choice}: ${description}`
        );
        const choice = await ctx.ui.select("MCP presets", options, { signal: session.signal });
        if (choice === undefined) return;
        name = list[options.indexOf(choice)]?.name ?? "";
      }

      if (name === CLEAR) {
        clearPresets(ctx);

        return;
      }

      const preset = all.find((candidate) => candidate.name === name);
      if (preset) toggle(preset, ctx);
      else
        ctx.ui.notify(
          `Usage: /mcp-presets <name> or /mcp-presets ${CLEAR}; no MCP preset has that name`,
          "error"
        );
    }
  });
}
