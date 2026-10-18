import { getCurrentSystemMessage } from "@earendil-works/pi-ai";
import {
  createToolSearchExtension,
  CustomEditor,
  type ExtensionAPI,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { splitModelReference } from "@pi-mono/utils/model-reference";

import { labelBorder } from "./editor-label.ts";
import type { MenuData } from "./menu.ts";
import {
  baseTools,
  isDirect,
  latestSelection,
  loadoutRecordedAfter,
  profileTools,
  restoredTools,
  SELECTION_ENTRY,
  TOOL_SEARCH,
  usedTools,
  withGroups,
  type Deferred,
  type Selection
} from "./selection.ts";
import { CLEAR, loadProfiles, type Profile, type ProfileConfig } from "./settings.ts";

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
    .map(([change, names]) => `${change} ${names.join(", ")}`);

  return parts.length > 0 ? `tools ${parts.join("; ")}` : "tools unchanged";
}

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
  let config: ProfileConfig | undefined;
  /** The latest selection's deferred tools, which the extension's `tool_search` can load. */
  let deferred: Deferred = [];
  /** Identifies the extension's `tool_search` in `pi.getAllTools()`. */
  let searchReach: unknown;
  /** Aborted when the session ends, so an open menu closes without a switch. */
  let session = new AbortController();
  /** The switch in progress. Requests and the end of the session wait for it. */
  let switching: Promise<void> | undefined;

  // Pi skips its built-in `tool_search` when an extension registers one while loading. This copy is
  // Pi's own tool, but it sees the deferred tools as `deferred`, so it finds and loads them too, and
  // the tools that it turns on bring the rest of their deferred groups.
  // It is always registered: a loading extension gets no trust decision, so the settings cannot tell
  // whether a project profile defers tools.
  await createToolSearchExtension()({
    ...pi,
    getAllTools: () => {
      const names = new Set(deferred.flat());

      return pi
        .getAllTools()
        .map((tool) =>
          names.has(tool.name) && isDirect(tool.exposure) ? { ...tool, exposure: "deferred" } : tool
        );
    },
    setActiveTools: (names) => pi.setActiveTools(withGroups(names, pi.getActiveTools(), deferred)),
    registerTool: (tool) => {
      searchReach = tool.reachesTools;
      pi.registerTool(tool);
    }
  });

  pi.registerFlag("profile", {
    description: `Profile for this run, or ${CLEAR} for no profile`,
    type: "string"
  });

  /** Whether the declarable `tool_search` is the extension's. */
  const ownsToolSearch = () =>
    searchReach !== undefined &&
    pi
      .getAllTools()
      .some(
        ({ name, exposure, reachesTools }) =>
          name === TOOL_SEARCH && exposure !== "hidden" && reachesTools === searchReach
      );

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
        new CustomEditor(tui, theme, keybindings, { embedWorkingStatus: false });
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
    latestSelection(ctx.sessionManager.getBranch())?.selection.name;
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

  /** The tools that a switch to the profile, or to no profile, requests now. */
  function planTools(profile: Profile | undefined, ctx: ExtensionContext) {
    const branch = ctx.sessionManager.getBranch();
    const before = pi.getActiveTools();
    const base = baseTools(before, latestSelection(branch)?.selection);
    const exposure = new Map(pi.getAllTools().map((tool) => [tool.name, tool.exposure]));
    const next = profile
      ? profileTools(profile, {
          base,
          active: before,
          used: usedTools(branch),
          exposure,
          ownsToolSearch: ownsToolSearch()
        })
      : { tools: base, deferred: [] };

    return { before, base, exposure, ...next };
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

    const plan = planTools(profile, ctx);
    pi.setActiveTools(plan.tools);
    const tools = pi.getActiveTools();
    deferred = plan.deferred;
    pi.appendEntry<Selection>(SELECTION_ENTRY, {
      name: profile?.name,
      base: plan.base,
      tools,
      deferred: plan.deferred
    });
    showLabel(profile?.name);
    const title = profile ? `Profile ${profile.name}` : "No profile";
    ctx.ui.notify(
      displayText(
        `${source}${title}: ${describeChange(plan.before, tools, new Set(deferred.flat()))}`
      ),
      "info"
    );
  }

  function restoreTools(ctx: ExtensionContext, reload: boolean): Selection | undefined {
    const branch = ctx.sessionManager.getBranch();
    const latest = latestSelection(branch);
    deferred = latest?.selection.deferred ?? [];
    showLabel(latest?.selection.name);
    if (!latest) return undefined;

    const recorded = loadoutRecordedAfter(branch, latest.index)
      ? (
          getCurrentSystemMessage(ctx.sessionManager.buildSessionProjection().messages)
            ?.toolsAdded ?? []
        ).map(({ name }) => name)
      : undefined;
    const active = pi.getActiveTools();
    const exposure = new Map(pi.getAllTools().map((tool) => [tool.name, tool.exposure]));
    const tools = restoredTools(latest.selection, {
      active,
      recorded,
      reload,
      exposure,
      ownsToolSearch: ownsToolSearch()
    });

    // A call that turns off a tool also drops Pi's pending tools, such as MCP tools that are
    // still connecting, so the tools are set only when they change.
    const changed =
      active.some((name) => !tools.includes(name)) ||
      tools.some((name) => exposure.has(name) && !active.includes(name));
    if (changed) pi.setActiveTools(tools);

    return latest.selection;
  }

  // Startup and /reload both start a session, so edited settings apply after /reload.
  pi.on("session_start", async (event, ctx) => {
    session = new AbortController();
    config = loadProfiles({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });

    if (ctx.hasUI) {
      for (const warning of config.warnings) ctx.ui.notify(`pi-profiles: ${warning}`, "warning");
    }

    if (config.profiles.length > 0) {
      pi.registerShortcut(config.shortcut, {
        description: "Switch to the next profile, or to no profile after the last",
        handler: async (shortcutCtx) => {
          const names = [...(config?.profiles ?? []).map(({ name }) => name), undefined];
          const next = names[(names.indexOf(currentName(shortcutCtx)) + 1) % names.length];
          await switchTo(findProfile(next), shortcutCtx);
        }
      });
      if (ctx.mode === "tui") labelEditor(ctx);
    }

    const selection = restoreTools(ctx, event.reason === "reload");
    const flag = pi.getFlag("profile");
    const requested = typeof flag === "string" ? choose(flag) : undefined;
    if (typeof flag === "string" && !requested && event.reason === "startup")
      reportError(ctx, `--profile names no configured profile; use a profile name or ${CLEAR}`);

    if (requested && (event.reason === "startup" || !selection)) {
      // Only when Pi starts does `--profile` replace a selection. Later sessions in the run, such
      // as after /new, keep theirs, and use `--profile` in place of the default profile.
      await switchTo(requested.profile, ctx);
    } else if (!selection) {
      // Print, JSON, and RPC runs, such as subagents, keep the model and tools they were given.
      if (ctx.mode === "tui" && config.defaultProfile)
        await switchTo(config.defaultProfile, ctx, "pi-profiles: ");
    } else if (ctx.hasUI && selection.name !== undefined && !findProfile(selection.name)) {
      ctx.ui.notify("pi-profiles: the selected profile is no longer configured", "warning");
    }
  });

  pi.on("session_tree", (_event, ctx) => {
    restoreTools(ctx, false);
  });

  pi.on("session_shutdown", async () => {
    session.abort();
    await switching;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    // A request that starts during a switch uses the profile's tools and prompts.
    await switching;
    const prompts = findProfile(currentName(ctx))?.appendSystemPrompts ?? [];
    if (prompts.length === 0) return;

    // Pi builds these options again for each run, so the prompts are added once per run.
    const options = event.systemPromptOptions;
    options.appendSystemPrompt = [options.appendSystemPrompt, ...prompts]
      .filter((text) => text !== "")
      .join("\n\n");
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
    const current = currentName(ctx);
    const choices = [...(config?.profiles ?? []), undefined].map((profile) => {
      const plan = planTools(profile, ctx);
      // Pi ignores unknown and `hidden` names, as in the switch.
      const declared = plan.tools.filter(
        (name) => plan.exposure.has(name) && plan.exposure.get(name) !== "hidden"
      );

      return {
        name: profile?.name ?? CLEAR,
        profile,
        current: profile?.name === current,
        change: describeChange(plan.before, declared, new Set(plan.deferred.flat())),
        modelAvailable: !profile?.model || profileModel(profile.model, ctx) !== undefined
      };
    });

    return {
      choices,
      profile: findProfile(current),
      tools: pi.getAllTools(),
      active: pi.getActiveTools(),
      deferred,
      used: usedTools(ctx.sessionManager.getBranch()),
      ownsToolSearch: ownsToolSearch()
    };
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
