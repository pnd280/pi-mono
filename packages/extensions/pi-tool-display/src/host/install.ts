import { randomUUID } from "node:crypto";

import type {
  AgentSession,
  AgentSessionEvent,
  ExtensionAPI,
  ToolInfo
} from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DisplayMode, ToolDisplayAdapter } from "../contracts.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import type { ToolDisplayRenderers } from "../rendering/types.ts";
import type { DisplaySettings } from "../settings.ts";
import { DisplaySession, type AdapterSelector } from "../transcript/session.ts";
import { record } from "../values.ts";
import { trackThinkingCompletion } from "./assistant.ts";
import {
  hostHook,
  hostMode,
  interactivePrototype,
  modeHooksCompatible,
  rowContractCompatible,
  type Host
} from "./compatibility.ts";
import { displaySettings } from "./configuration.ts";
import { executionOutcome, hostToolResult, TranscriptMessages } from "./messages.ts";
import { NativeRegistry } from "./native-registry.ts";
import { TranscriptRows } from "./rows.ts";
import { selectAdapter } from "./selection.ts";

type Binding = {
  host: Host;
  display: DisplaySession;
  messages: TranscriptMessages;
  rows: TranscriptRows;
};

const nextMode: Record<DisplayMode, DisplayMode> = {
  summary: "compact",
  compact: "verbose",
  verbose: "summary"
};

/** Summaries collapse only in fullscreen, where no transcript row is already in
 * scrollback, and only when row chrome can draw summary lines.
 */
function summaries(host: Host, rowChrome: boolean): boolean {
  return rowChrome && host.ui?.mode === "fullscreen";
}

/** Without summaries, summary renders as compact, so the cycle skips the identical step. */
function cycle(mode: DisplayMode, summarized: boolean): DisplayMode {
  return mode !== "verbose" && !summarized ? "verbose" : nextMode[mode];
}

function shownMode(mode: DisplayMode, summarized: boolean): DisplayMode {
  return mode === "summary" && !summarized ? "compact" : mode;
}

function updatedContentIndex(event: AgentSessionEvent): number | undefined {
  if (event.type !== "message_update") return undefined;

  return "contentIndex" in event.assistantMessageEvent
    ? event.assistantMessageEvent.contentIndex
    : undefined;
}

export function installHostIntegration(
  append?: ExtensionAPI["appendEntry"],
  warn: (message: string) => void = () => {}
): (() => void) | undefined {
  const prototype = interactivePrototype();
  prototype[hostHook]?.();
  const previousLookup = prototype.getRegisteredToolDefinition;
  if (typeof previousLookup !== "function") return undefined;
  const hooks = new OwnedHooks();
  const bindings = new Set<Binding>();
  const hosts = new WeakMap<Host, Binding>();
  const sessions = new WeakMap<AgentSession, Binding>();
  const originalToggle = prototype.toggleToolOutputExpansion;
  const originalSetExpanded = prototype.setToolsExpanded;
  const modeHooks = modeHooksCompatible(prototype);
  const rowChrome = rowContractCompatible();
  let modeWarning = false;
  let rowWarning = false;
  let active = true;

  const warning = (text: string) => {
    try {
      warn(`pi-tool-display: ${text}`);
    } catch {
      /* UI may already be disposed. */
    }
  };

  const failedAdapters = new Set<string>();

  // One warning per adapter: a broken adapter must not look like a declined contract.
  const adapterFailure = (failed: ToolDisplayAdapter) => {
    if (failedAdapters.has(failed.id)) return;

    failedAdapters.add(failed.id);
    warning(`display adapter ${failed.id} failed; its calls render generically.`);
  };

  const native = new NativeRegistry((session) => sessions.get(session)?.display, warning);

  /** Pi builds every tool's info on each call; index it once, on the first lookup. */
  function adapters(session: AgentSession, configuration: DisplaySettings): AdapterSelector {
    let tools: Map<string, ToolInfo> | undefined;

    return (name) => {
      const definition = session.getToolDefinition(name);
      tools ??= new Map(session.getAllTools().map((tool) => [tool.name, tool]));
      const info = tools.get(name);

      return selectAdapter(
        configuration,
        name,
        // Owner renderers: extension resolvers, then the registered tool. Pi's built-in
        // renderers are excluded. Unregistered names keep generic cards, which late
        // registration (such as MCP reconnecting after reload) can upgrade; Pi's rows cannot.
        definition && session.extensionRunner.resolveToolRenderers(name, () => definition),
        native.isNative(session, name, info),
        info
      );
    };
  }

  function release(binding: Binding): void {
    binding.rows.dispose();
    binding.display.dispose();
    bindings.delete(binding);
    hosts.delete(binding.host);
    if (sessions.get(binding.host.session) === binding) sessions.delete(binding.host.session);
  }

  function ensure(host: Host, reset = false): Binding | undefined {
    if (!active || !host.ui || !host.chatContainer) return undefined;
    let binding = hosts.get(host);

    if (binding && (reset || sessions.get(host.session) !== binding)) {
      release(binding);
      binding = undefined;
    }

    if (binding) return binding;
    const configuration = displaySettings(host.session);
    configuration.warnings.forEach(warning);

    if (!modeHooks && configuration.valid && !modeWarning) {
      modeWarning = true;
      warning(`mode cycling unavailable; Ctrl+O toggles ${configuration.collapsedMode} ↔ verbose.`);
    }

    if (!rowChrome && !rowWarning) {
      rowWarning = true;
      warning("row contract unavailable; summaries disabled.");
    }

    const display = new DisplaySession({
      mode: initialMode(host, configuration),
      runtime: randomUUID(),
      cwd: host.session.sessionManager.getCwd(),
      history: host.session.sessionManager,
      settings: configuration,
      adapters: () => adapters(host.session, configuration),
      onAdapterFailure: adapterFailure,
      expanded: () => host.toolOutputExpanded ?? false,
      append
    });
    display.coordinator.setSummaries(summaries(host, rowChrome));
    const current: Binding = {
      host,
      display,
      messages: new TranscriptMessages(configuration.valid && rowChrome),
      rows: new TranscriptRows(host, display.coordinator, {
        active: () => active && hosts.get(host) === current,
        styleAssistant: configuration.valid,
        chrome: rowChrome,
        ...(modeHooks
          ? {}
          : {
              syncMode: () =>
                display.coordinator.setMode(
                  host.toolOutputExpanded ? "verbose" : configuration.collapsedMode
                )
            })
      })
    };
    hosts.set(host, current);
    sessions.set(host.session, current);
    bindings.add(current);
    native.bind(host.session, () => {
      const select = adapters(host.session, configuration);

      return ["bash", "powershell", "edit", "write"].some(
        (name) => select(name)?.id === `pi:${name}`
      );
    });

    return current;
  }

  /** Pi's --verbose expands startup output; it starts tool output in verbose mode too. */
  function initialMode(host: Host, configuration: DisplaySettings): DisplayMode {
    const collapsed = configuration.collapsedMode;
    if (host.toolOutputExpanded) return "verbose";
    if (!modeHooks || !configuration.valid) return collapsed;
    const stored = host[hostMode];
    if (stored === "summary" || stored === "compact") return stored;

    if (stored === undefined && host.getStartupExpansionState?.call(host)) {
      // Keep Pi's own state consistent so later rows and toggles agree.
      host.toolOutputExpanded = true;

      return "verbose";
    }

    return collapsed;
  }

  /** Pi's header and resources expand only when crossing the verbose boundary. */
  function transition(host: Host, binding: Binding, mode: DisplayMode): void {
    const coordinator = binding.display.coordinator;
    const current = coordinator.mode;
    if (current === mode || !originalSetExpanded) return;

    if (mode === "verbose") {
      coordinator.setMode(mode);
      originalSetExpanded.call(host, true);
    } else if (current === "verbose") {
      originalSetExpanded.call(host, false);
      coordinator.setMode(mode);
    } else coordinator.setMode(mode);

    host[hostMode] = mode;
    // Replaces Pi's expanded/collapsed status on the same line.
    host.showStatus?.(`Tool output: ${shownMode(mode, summaries(host, rowChrome))}`);
  }

  const lookup: Host["getRegisteredToolDefinition"] = function (this: Host, name) {
    const definition = previousLookup.call(this, name); // Exactly once; preserve failures.
    if (!active) return definition;

    try {
      const binding = hosts.get(this);
      const configuration = binding?.display.settings ?? displaySettings(this.session);
      const selected = binding
        ? binding.display.selectAdapter(name)
        : adapters(this.session, configuration)(name);
      if (!selected) return definition;
      let renderers: ToolDisplayRenderers | undefined;

      // Lookup has only a tool name. Pi supplies the exact call ID when constructing
      // the row's renderer slots, before inserting that row into the transcript.
      const resolveRenderers = (id: string): ToolDisplayRenderers => {
        if (renderers) return renderers;
        const call = binding?.rows.claimCall(name, id);
        renderers = createToolDisplayRenderers(name, selected, {
          showParameters: configuration.showParameters,
          onAdapterFailure: adapterFailure,
          ...(call && binding
            ? { binding: { call, coordinator: binding.display.coordinator } }
            : {})
        });
        if (call) binding?.rows.retainDefinition(view, call);

        return renderers;
      };

      const slots: ToolDisplayRenderers = {
        renderShell: "self",
        renderCall(args, theme, context) {
          binding?.rows.useTheme(theme);

          return resolveRenderers(context.toolCallId).renderCall(args, theme, context);
        },
        renderResult(result, options, theme, context) {
          binding?.rows.useTheme(theme);

          return resolveRenderers(context.toolCallId).renderResult(result, options, theme, context);
        }
      };
      const view = { ...definition, ...slots };

      return view;
    } catch {
      return definition;
    }
  };

  function observeInsertion<Args extends unknown[], Result>(
    insert: (this: Host, ...args: Args) => Result
  ) {
    return function (this: Host, ...args: Args): Result {
      const binding = active ? hosts.get(this) : undefined;
      if (!binding) return insert.apply(this, args);
      binding.rows.prepareInsertion();
      const result = insert.apply(this, args);
      binding.rows.finishInsertion();

      return result;
    };
  }

  const dispose = () => {
    if (!active) return;
    active = false;
    for (const binding of bindings) release(binding);
    native.dispose();
    hooks.restore();
    if (prototype[hostHook] === dispose) delete prototype[hostHook];
  };

  try {
    hooks.replace(prototype, "getRegisteredToolDefinition", lookup);

    // Pi can suppress custom entries or insert notices before streaming rows.
    // Observe actual insertion, not registration or the last indexed call.
    for (const key of [
      "maybeShowThinkingDropNotice",
      "addCacheMissNotice",
      "addCacheWarmingUsage",
      "addCustomEntryToChat"
    ] as const) {
      const insert = prototype[key];
      if (typeof insert !== "function") continue;
      hooks.replace(prototype, key, observeInsertion(insert));
    }

    // Pi also uses showStatus for thinking toggles, which must not split runs.
    const notify = prototype.showExtensionNotify;
    if (typeof notify === "function")
      hooks.replace(prototype, "showExtensionNotify", observeInsertion(notify));

    if (modeHooks && originalToggle && originalSetExpanded) {
      hooks.replace(prototype, "toggleToolOutputExpansion", function (this: Host) {
        const binding = active ? hosts.get(this) : undefined;
        // Invalid settings keep original rendering, where summary and compact are identical.
        if (!binding?.display.settings.valid) return originalToggle.call(this);
        transition(
          this,
          binding,
          cycle(binding.display.coordinator.mode, summaries(this, rowChrome))
        );
      });
      hooks.replace(prototype, "setToolsExpanded", function (this: Host, expanded: boolean) {
        const binding = active ? hosts.get(this) : undefined;
        if (!binding?.display.settings.valid) return originalSetExpanded.call(this, expanded);
        const mode = binding.display.coordinator.mode;
        if (expanded) transition(this, binding, "verbose");
        // Collapsing applies only to verbose; summary and compact are both collapsed.
        else if (mode === "verbose")
          transition(this, binding, binding.display.settings.collapsedMode);
      });
    }

    // Pi switches renderers from /settings and back to regular before printing on exit.
    const switchMode = prototype.switchTuiMode;
    if (typeof switchMode === "function")
      hooks.replace(prototype, "switchTuiMode", function (this: Host, ...args: unknown[]) {
        const result = switchMode.apply(this, args);
        const binding = active ? hosts.get(this) : undefined;
        binding?.display.coordinator.setSummaries(summaries(this, rowChrome));

        return result;
      });

    const thinkingVisibility = prototype.updateThinkingBlockVisibility;
    if (typeof thinkingVisibility === "function")
      hooks.replace(prototype, "updateThinkingBlockVisibility", function (this: Host) {
        const binding = active ? hosts.get(this) : undefined;
        // A global toggle visits every assistant row. Reconcile only after all
        // boundaries reflect final visibility, never through intermediate merges.
        if (binding) return binding.display.coordinator.batch(() => thinkingVisibility.call(this));

        return thinkingVisibility.call(this);
      });

    const addMessage = prototype.addMessageToChat;
    if (typeof addMessage === "function")
      hooks.replace(prototype, "addMessageToChat", function (this: Host, value, options) {
        const binding = active ? hosts.get(this) : undefined;
        const assistant = record(value).role === "assistant";
        if (!assistant) binding?.rows.prepareInsertion();
        const result = addMessage.call(this, value, options);
        if (assistant) binding?.rows.assistantBoundary(this.chatContainer?.children.at(-1));
        else binding?.rows.finishInsertion(value);

        return result;
      });
    const reconstruct = prototype.renderSessionItems;
    const handle = prototype.handleEvent;
    if (typeof reconstruct === "function" && typeof handle === "function") {
      hooks.replace(prototype, "renderSessionItems", function (this: Host, items, options) {
        // Pi appends replay slices around a boundary compaction summary. Retain
        // earlier rows and their ownership until the host clears the transcript.
        const binding = active
          ? ensure(this, this.chatContainer?.children.length === 0)
          : undefined;
        if (!binding) return reconstruct.call(this, items, options);
        const result = binding.display.reconstruct(() => {
          for (const item of items)
            binding.display.message(binding.messages.read(item), "historical");

          // Pi discovers visible assistant/notice boundaries while creating rows.
          // Reconcile once after those insertions, before binding expansion state.
          return reconstruct.call(this, items, options);
        });

        binding.rows.bind();

        return result;
      });
      hooks.replace(prototype, "handleEvent", async function (this: Host, event) {
        const binding = ensure(this);

        if (binding) {
          const display = binding.display;
          if (event.type === "message_update")
            trackThinkingCompletion(this.streamingComponent, event.assistantMessageEvent);

          if (
            event.type === "message_start" ||
            event.type === "message_update" ||
            event.type === "message_end"
          ) {
            display.message(
              binding.messages.read(event.message, updatedContentIndex(event)),
              "live",
              event.type === "message_end"
            );
          }

          if (event.type === "tool_execution_start") display.queued(event.toolCallId);
          if (event.type === "tool_execution_update" || event.type === "tool_execution_end")
            display.result(
              event.toolCallId,
              hostToolResult(
                event.type === "tool_execution_update" ? event.partialResult : event.result
              ),
              event.type === "tool_execution_end"
                ? executionOutcome(event.isError, this.session.agent.signal)
                : "success",
              event.type === "tool_execution_update"
            );
          if (event.type === "agent_end") display.coordinator.settle();
        }

        // message_end updates the component and clears the host's streaming reference.
        const streaming = this.streamingComponent;
        if (event.type === "compaction_end") binding?.rows.prepareInsertion();
        await handle.call(this, event);
        // Success reconstructs the binding before appending the summary; failed
        // compactions append notices to the original binding instead.
        const current = active ? hosts.get(this) : undefined;
        if (event.type === "compaction_end") current?.rows.finishInsertion();

        if (binding && current === binding) {
          binding.rows.assistantBoundary(this.streamingComponent ?? streaming);
          binding.rows.bind();
        }
      });
    } else warning("transcript row contract unavailable; grouping disabled.");
    prototype[hostHook] = dispose;

    return dispose;
  } catch {
    dispose();

    return undefined;
  }
}
