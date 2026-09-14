import { randomUUID } from "node:crypto";

import type { AgentSession, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

import { createToolDisplayRenderers } from "../rendering/cards.ts";
import type { DisplaySettings } from "../settings.ts";
import { DisplaySession } from "../transcript/session.ts";
import { record } from "../values.ts";
import { hostHook, interactivePrototype, type Host } from "./compatibility.ts";
import { displaySettings } from "./configuration.ts";
import { OwnedHooks } from "./hooks.ts";
import { hostToolResult, transcriptMessage } from "./messages.ts";
import { NativeRegistry } from "./native-registry.ts";
import { TranscriptRows } from "./rows.ts";
import { selectAdapter } from "./selection.ts";

type Binding = { host: Host; display: DisplaySession; rows: TranscriptRows };

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
  let active = true;

  const warning = (text: string) => {
    try {
      warn(`pi-tool-display: ${text}`);
    } catch {
      /* UI may already be disposed. */
    }
  };

  const native = new NativeRegistry((session) => sessions.get(session)?.display, warning);

  function adapter(session: AgentSession, name: string, configuration: DisplaySettings) {
    return selectAdapter(
      configuration,
      name,
      session.getToolDefinition(name),
      native.isNative(session, name),
      session.getAllTools().find((tool) => tool.name === name)
    );
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
    const display = new DisplaySession({
      runtime: randomUUID(),
      history: host.session.sessionManager,
      settings: configuration,
      selectAdapter: (name) => adapter(host.session, name, configuration),
      expanded: () => host.toolOutputExpanded ?? false,
      append
    });
    const current: Binding = {
      host,
      display,
      rows: new TranscriptRows(host, display, () => active && hosts.get(host) === current)
    };
    hosts.set(host, current);
    sessions.set(host.session, current);
    bindings.add(current);
    native.bind(host.session, () =>
      ["bash", "powershell", "edit", "write"].some(
        (name) => adapter(host.session, name, configuration)?.id === `pi:${name}`
      )
    );

    return current;
  }

  function compactionBoundary(host: Host, before: readonly Component[] | undefined): void {
    if (!before) return;
    const binding = hosts.get(host);
    const last = host.chatContainer?.children.at(-1);
    // Success reconstructs the binding; failures/cancellation can append notices without it.
    if (binding && last && !before.includes(last)) binding.rows.boundaryBefore(last);
  }

  const lookup: Host["getRegisteredToolDefinition"] = function (this: Host, name) {
    const definition = previousLookup.call(this, name); // Exactly once; preserve failures.
    if (!active) return definition;

    try {
      const binding = hosts.get(this);
      const configuration = binding?.display.settings ?? displaySettings(this.session);
      const selected = adapter(this.session, name, configuration);
      if (!selected) return definition;
      const call = binding?.rows.claimCall(name);
      const view = {
        ...definition,
        ...createToolDisplayRenderers(name, selected, {
          showParameters: configuration.showParameters,
          ...(call && binding
            ? { binding: { call, coordinator: binding.display.coordinator } }
            : {})
        })
      };
      if (call) binding?.rows.retainDefinition(view, call);

      return view;
    } catch {
      return definition;
    }
  };

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
    native.install(hooks);

    // Pi can suppress custom entries or insert notices before streaming rows.
    // Observe actual insertion, not registration or the last indexed call.
    for (const key of [
      "maybeShowAssistantDiagnostics",
      "addCacheMissNotice",
      "addCustomEntryToChat"
    ] as const) {
      const insert = prototype[key];
      if (typeof insert !== "function") continue;
      hooks.replace(prototype, key, function (this: Host, value: unknown) {
        const binding = active ? hosts.get(this) : undefined;
        if (!binding) return insert.call(this, value);
        const before = this.chatContainer?.children.slice() ?? [];
        const result = insert.call(this, value);
        const children = this.chatContainer?.children ?? [];

        if (children.length > before.length) {
          const inserted = children.find((child, index) => child !== before[index]);
          if (inserted) binding.rows.boundaryBefore(inserted);
        }

        return result;
      });
    }

    const addMessage = prototype.addMessageToChat;
    if (typeof addMessage === "function")
      hooks.replace(prototype, "addMessageToChat", function (this: Host, value, options) {
        const result = addMessage.call(this, value, options);
        const binding = active ? hosts.get(this) : undefined;
        if (binding && record(value).role === "assistant")
          binding.rows.assistantBoundary(this.chatContainer?.children.at(-1));

        return result;
      });
    const reconstruct = prototype.renderSessionItems;
    const handle = prototype.handleEvent;
    if (typeof reconstruct === "function" && typeof handle === "function") {
      hooks.replace(prototype, "renderSessionItems", function (this: Host, items, options) {
        const binding = active ? ensure(this, true) : undefined;
        if (binding)
          for (const item of items) binding.display.message(transcriptMessage(item), "historical");
        const result = reconstruct.call(this, items, options);

        if (binding) {
          binding.rows.bind();
          for (const call of binding.display.coordinator.calls.values())
            binding.display.loadSavedOutput(call);
        }

        return result;
      });
      hooks.replace(prototype, "handleEvent", async function (this: Host, event) {
        const binding = active ? ensure(this) : undefined;

        if (binding) {
          const display = binding.display;
          if (
            event.type === "message_start" ||
            event.type === "message_update" ||
            event.type === "message_end"
          )
            display.message(transcriptMessage(event.message), "live", event.type === "message_end");
          if (event.type === "tool_execution_start") display.queued(event.toolCallId);
          if (event.type === "tool_execution_update" || event.type === "tool_execution_end")
            display.result(
              event.toolCallId,
              hostToolResult(
                event.type === "tool_execution_update" ? event.partialResult : event.result
              ),
              event.type === "tool_execution_end" && event.isError ? "failure" : "success",
              event.type === "tool_execution_update"
            );
          if (event.type === "agent_end") display.coordinator.settle();
        }

        // message_end updates the component and clears the host's streaming reference.
        const streaming = this.streamingComponent;
        const compactionChildren =
          event.type === "compaction_end" ? this.chatContainer?.children.slice() : undefined;
        await handle.call(this, event);
        compactionBoundary(this, compactionChildren);

        if (binding) {
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
