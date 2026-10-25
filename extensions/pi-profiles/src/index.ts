import {
  createToolSearchExtension,
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionStartEvent,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";
import { joinPromptParts } from "@pi-mono/libs/prompt-parts";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { splitModelReference } from "@pi-mono/utils/model-reference";

import { labelBorder } from "./editor-label.ts";
import type { MenuData } from "./menu.ts";
import {
  enforcedTools,
  latestSelection,
  planRestore,
  planSwitch,
  reportTools,
  searchableTools,
  SELECTION_ENTRY,
  withGroups,
  type Rules,
  type Selection
} from "./selection.ts";
import { CLEAR, loadProfiles, type Profile, type ProfileConfig } from "./settings.ts";

const ID = "pi-profiles";
/** After pi-model-prompt (`100`), so the profile's prompts follow the model's text. */
const PROMPT_RANK = 200;
/** After pi-nested-instructions (`100`), so the selection entry follows its startup messages. */
const STARTUP_RANK = 200;

// The menu and its shared TUI components load on first use, not at startup. Concurrent opens
// share one import: under jiti a concurrent import can return a partly evaluated module.
const importMenu = () => import("./menu.ts");
let menuModule: ReturnType<typeof importMenu> | undefined;
const loadMenu = () => (menuModule ??= importMenu());

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

  // Pi skips its built-in `tool_search` when an extension registers one while loading. This copy is
  // Pi's own tool, but it sees the deferred tools as `deferred`, so it finds and loads them too, and
  // the tools that it turns on bring the rest of their deferred groups.
  // It is always registered: a loading extension gets no trust decision, so the settings cannot tell
  // whether a project profile defers tools.
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
        // A copy, because an earlier editor can return the same array again.
        const lines = [...render(width)];
        const [top] = lines;
        if (label !== undefined && top !== undefined)
          lines[0] = labelBorder(top, label, (text) => editor.borderColor?.(text) ?? text);

        return lines;
      };

      requestRender = () => tui.requestRender();

      return editor;
    });
  }

  const currentName = (ctx: ExtensionContext) =>
    latestSelection(ctx.sessionManager.getBranch())?.name;
  const findProfile = (name: string | undefined) =>
    config?.profiles.find((profile) => profile.name === name);

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

  /**
   * Without a profile, the model and thinking level stay, and the previous profile's tool changes
   * are undone. `source` prefixes notices for switches that the user did not request.
   */
  async function switchTo(
    profile: Profile | undefined,
    ctx: ExtensionContext,
    source = ""
  ): Promise<void> {
    if (session.signal.aborted) return;

    if (!ctx.isIdle() || switching) {
      ctx.ui.notify(
        "Profiles cannot change while the agent runs or another switch is in progress",
        "warning"
      );

      return;
    }

    switching = apply(profile, ctx, source).finally(() => {
      switching = undefined;
    });
    // A run that starts now builds its prompt after the switch, with the profile and its model.
    prompt.hold(switching);
    await switching;
  }

  async function apply(profile: Profile | undefined, ctx: ExtensionContext, source: string) {
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

        return;
      }
    }

    if (profile?.thinking) pi.setThinkingLevel(profile.thinking);

    const plan = planSwitch(profile, toolState(ctx));
    pi.setActiveTools(plan.tools);
    const result = plan.settle(pi.getActiveTools());
    rules = result.rules;
    pi.appendEntry<Selection>(SELECTION_ENTRY, result.entry);
    showLabel(profile?.name);
    const title = profile ? `Profile ${profile.name}` : "No profile";
    ctx.ui.notify(displayText(`${source}${title}: ${result.change}`), "info");
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
    showLabel(plan.selection?.name);
    if (plan.tools) pi.setActiveTools(plan.tools);

    return plan.selection;
  }

  /** Restores the session's selection, then applies `--profile` or the default profile. */
  async function startProfile(
    reason: SessionStartEvent["reason"],
    loaded: ProfileConfig,
    ctx: ExtensionContext
  ): Promise<void> {
    const selection = restoreTools(ctx, reason === "reload");
    const flag = pi.getFlag("profile");
    const requested = typeof flag === "string" ? choose(flag) : undefined;
    if (typeof flag === "string" && !requested && reason === "startup")
      reportError(ctx, `--profile names no configured profile; use a profile name or ${CLEAR}`);

    if (requested && (reason === "startup" || !selection)) {
      // Only when Pi starts does `--profile` replace a selection. Later sessions in the run, such
      // as after /new, keep theirs, and use `--profile` in place of the default profile.
      await switchTo(requested.profile, ctx);
    } else if (!selection) {
      // Print, JSON, and RPC runs, such as subagents, keep the model and tools they were given.
      if (ctx.mode === "tui" && loaded.defaultProfile)
        await switchTo(loaded.defaultProfile, ctx, "pi-profiles: ");
    } else if (ctx.hasUI && selection.name !== undefined && !findProfile(selection.name)) {
      ctx.ui.notify("pi-profiles: the selected profile is no longer configured", "warning");
    }
  }

  // Startup and /reload both start a session, so edited settings apply after /reload.
  lifecycle.onSessionStart((event, ctx, arrival) => {
    session = new AbortController();
    const loaded = loadProfiles({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });
    config = loaded;

    if (ctx.hasUI) {
      for (const warning of loaded.warnings) ctx.ui.notify(`pi-profiles: ${warning}`, "warning");
    }

    if (loaded.profiles.length > 0) {
      arrival.claimShortcut(loaded.shortcut, {
        description: "Switch to the next profile, or to no profile after the last",
        handler: async (shortcutCtx) => {
          const names = [...loaded.profiles.map(({ name }) => name), undefined];
          const next = names[(names.indexOf(currentName(shortcutCtx)) + 1) % names.length];
          await switchTo(findProfile(next), shortcutCtx);
        }
      });
      if (ctx.mode === "tui") labelEditor(ctx);
    }

    // Commits run in the first participant's `resources_discover` handler, which Pi emits after
    // every extension's `session_start` handler, so the tools that they register are known, and
    // the selection entry follows pi-nested-instructions' startup messages (`100`).
    arrival.commit(STARTUP_RANK, () => startProfile(event.reason, loaded, ctx));
  });

  pi.on("session_before_tree", async (_event, ctx) => {
    // Save the selection on its original branch before Pi moves the leaf.
    await switching;
    treeSelection = latestSelection(ctx.sessionManager.getBranch());
  });

  pi.on("session_tree", (_event, ctx) => {
    restoreTools(ctx, false, treeSelection);
    treeSelection = undefined;
  });

  pi.on("session_before_switch", async () => {
    // A same-file resume must read the selection saved by the completed switch.
    await switching;
  });

  // Before any extension awaits its shutdown work, no new switch starts and the menu closes. The
  // switch in progress still saves its selection.
  lifecycle.onSessionShutdown(
    () => session.abort(),
    () => switching
  );

  // The coordinator calls parts after every hold, such as a switch, has settled.
  prompt.part(PROMPT_RANK, (ctx) =>
    findProfile(currentName(ctx))
      ?.prompts.filter((text) => text !== "")
      .join("\n\n")
  );

  /**
   * Turns off the selection's `deny` tools, which other extensions, `tool_search`, or `--tools`
   * can turn on again, and puts the active tools in a fixed order. Sets them only when they change.
   */
  function enforceTools(): void {
    const tools = enforcedTools(pi.getActiveTools(), pi.getAllTools(), rules);
    if (tools) pi.setActiveTools(tools);
  }

  // The run's first request declares the tools that are active when before_agent_start ends.
  pi.on("before_agent_start", async () => {
    // A run that starts during a switch uses the profile's tools.
    await switching;
    enforceTools();
  });

  // A later request declares the tools that are active when the previous turn ends. Pi takes them
  // before turn_start, so a change in turn_start reaches only the request after.
  pi.on("turn_end", () => {
    enforceTools();
  });

  /** The configured profiles, then `clear` for no profile. */
  const choices = () => [
    ...(config?.profiles ?? []).map(({ name, description }) => ({
      name,
      description: compactDisplayText(description)
    })),
    { name: CLEAR, description: "No profile" }
  ];

  /** The profiles, with the change that each switch would make now, and the state of every tool. */
  function menuData(ctx: ExtensionContext): MenuData {
    const state = toolState(ctx);
    const current = latestSelection(state.branch)?.name;
    const profile = findProfile(current);
    const choices = [...(config?.profiles ?? []), undefined].map((choice) => ({
      name: choice?.name ?? CLEAR,
      profile: choice,
      current: choice?.name === current,
      change: planSwitch(choice, state).change,
      modelAvailable: !choice?.model || profileModel(choice.model, ctx) !== undefined
    }));

    return { choices, profile, tools: reportTools(state, rules, profile) };
  }

  pi.registerCommand("profile", {
    description: "Switch profile",
    getArgumentCompletions: (prefix) =>
      choices()
        .filter(({ name }) => name.startsWith(prefix.trim()))
        .map(({ name, description }) => ({ value: name, label: name, description })),
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

        try {
          const { openMenu } = await loadMenu();
          if (signal.aborted) return;
          await openMenu({
            ui,
            signal,
            data: menuData(ctx),
            onSwitch: (profile) => switchTo(profile, ctx),
            notify: (message, type) => ui.notify(message, type)
          });
        } catch (error) {
          if (!signal.aborted)
            ui.notify(displayText(error instanceof Error ? error.message : String(error)), "error");
        }

        return;
      }

      if (name === "" && ctx.hasUI) {
        const list = choices();
        const current = currentName(ctx) ?? CLEAR;
        const options = list.map(
          (choice) =>
            `${choice.name}${choice.name === current ? " (current)" : ""}: ${choice.description}`
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
          "warning"
        );
    }
  });
}
