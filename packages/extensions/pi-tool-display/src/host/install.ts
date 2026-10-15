import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DisplayAction, DisplayMode } from "../contracts.ts";
import type { DisplaySettings } from "../settings.ts";
import { TranscriptMessages } from "../transcript/messages.ts";
import type { DisplaySession } from "../transcript/session.ts";
import { trackThinkingCompletion } from "./assistant.ts";
import type { DisplayCollector, DisplayCollectors } from "./collection.ts";
import {
  hostHook,
  hostMode,
  interactivePrototype,
  modeHooksCompatible,
  rowContractCompatible,
  type Host
} from "./compatibility.ts";
import { displaySettings } from "./configuration.ts";
import { TranscriptRows } from "./rows.ts";

type Binding = {
  host: Host;
  display: DisplaySession;
  collector: DisplayCollector;
  messages: TranscriptMessages;
  rows: TranscriptRows;
  detach: () => void;
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

export function installHostIntegration(
  collection: DisplayCollectors,
  action: (action: DisplayAction) => void = () => {}
): (() => void) | undefined {
  const prototype = interactivePrototype();
  prototype[hostHook]?.();
  const previousLookup = prototype.getRegisteredToolDefinition;
  if (typeof previousLookup !== "function") return undefined;
  const hooks = new OwnedHooks();
  const bindings = new Set<Binding>();
  const hosts = new WeakMap<Host, Binding>();
  const sessions = new WeakMap<AgentSession, Binding>();
  const hostRows = new WeakMap<Host, TranscriptRows>();
  const originalToggle = prototype.toggleToolOutputExpansion;
  const originalSetExpanded = prototype.setToolsExpanded;
  const modeHooks = modeHooksCompatible(prototype);
  const rowChrome = rowContractCompatible();
  let modeWarning = false;
  let rowWarning = false;
  let active = true;

  function rowsFor(host: Host): TranscriptRows {
    let rows = hostRows.get(host);
    if (!rows) hostRows.set(host, (rows = new TranscriptRows(host)));

    return rows;
  }

  function release(binding: Binding): void {
    binding.rows.release();
    binding.detach();
    bindings.delete(binding);
    hosts.delete(binding.host);
    if (sessions.get(binding.host.session) === binding) sessions.delete(binding.host.session);
  }

  function ensure(host: Host, reset = false): Binding | undefined {
    if (!active || !host.ui || !host.chatContainer) return undefined;
    let binding = hosts.get(host);

    if (
      binding &&
      (reset ||
        sessions.get(host.session) !== binding ||
        binding.collector.sessionId !== host.session.sessionManager.getSessionId())
    ) {
      release(binding);
      binding = undefined;
    }

    if (binding) return binding;
    const collector = collection.get(host.session);
    if (!collector) return;
    const configuration = collector.settings;

    if (!modeHooks && configuration.valid && !modeWarning) {
      modeWarning = true;
      collection.warning(
        `mode cycling unavailable; Ctrl+O toggles ${configuration.collapsedMode} ↔ verbose.`
      );
    }

    if (!rowChrome && !rowWarning) {
      rowWarning = true;
      collection.warning("row contract unavailable; summaries disabled.");
    }

    const display = reset ? collector.reconstruct() : collector.display;
    display.coordinator.setMode(initialMode(host, configuration));
    display.coordinator.setSummaries(summaries(host, rowChrome));
    const rows = rowsFor(host);
    rows.attach(display.coordinator, {
      styleAssistant: configuration.valid,
      chrome: rowChrome,
      action,
      ...(modeHooks
        ? {}
        : {
            syncMode: () =>
              display.coordinator.setMode(
                host.toolOutputExpanded ? "verbose" : configuration.collapsedMode
              )
          })
    });
    const current: Binding = {
      host,
      display,
      collector,
      messages: new TranscriptMessages(configuration.valid && rowChrome),
      rows,
      detach: collector.attach(() => host.toolOutputExpanded ?? false)
    };
    hosts.set(host, current);
    sessions.set(host.session, current);
    bindings.add(current);

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
        : collection.tools(this.session, configuration).adapter(name);
      if (!selected) return definition;

      return rowsFor(this).definition(definition, name, selected, {
        showParameters: configuration.showParameters,
        onFailure: (failed) => collection.failure(failed)
      });
    } catch {
      return definition;
    }
  };

  function observeInsertion<Args extends unknown[], Result>(
    insert: (this: Host, ...args: Args) => Result
  ) {
    return function (this: Host, ...args: Args): Result {
      return rowsFor(this).insert(() => insert.apply(this, args));
    };
  }

  const dispose = () => {
    if (!active) return;
    active = false;
    for (const binding of bindings) release(binding);
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
        return rowsFor(this).addMessage(value, () => addMessage.call(this, value, options));
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
          if (event.type === "message_update")
            trackThinkingCompletion(this.streamingComponent, event.assistantMessageEvent);
          // The collector deduplicates the public event if its subscriber ran first.
          binding.collector.event(event);
        }

        await rowsFor(this).handleEvent(event.type, () => handle.call(this, event));
      });
    } else collection.warning("transcript row contract unavailable; grouping disabled.");
    prototype[hostHook] = dispose;

    return dispose;
  } catch {
    dispose();

    return undefined;
  }
}
