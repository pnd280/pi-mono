import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import { observeNativeDefinition, type NativeSettings } from "../observation/native.ts";
import type { DisplaySession } from "../transcript/session.ts";
import {
  inspectedConstruction,
  nativePrototype,
  nativeSession,
  unchangedDefinition,
  type SessionInternals
} from "./compatibility.ts";

type ObservedDefinition = {
  original: ToolDefinition;
  replacement: ToolDefinition;
  fields: ToolDefinition;
};

/** Owns native factory provenance and replacements, never presentation or transcript state. */
export class NativeRegistry {
  private pristine = new WeakMap<
    AgentSession,
    {
      settings: NativeSettings;
      definitions: Map<string, { definition: ToolDefinition; fields: ToolDefinition }>;
    }
  >();
  private observed = new Map<AgentSession, Map<string, ObservedDefinition>>();
  private building = new WeakMap<AgentSession, NativeSettings>();
  private installedRefresh: SessionInternals["_refreshToolRegistry"] | undefined;
  private active = true;
  constructor(
    private display: (session: AgentSession) => DisplaySession | undefined,
    private warning: (message: string) => void
  ) {}
  install(hooks: OwnedHooks): void {
    const prototype = nativePrototype();
    if (!inspectedConstruction(prototype)) return;
    const build = prototype._buildRuntime;
    const refresh = prototype._refreshToolRegistry;
    const registry = this;
    hooks.replace(prototype, "_buildRuntime", function (this: AgentSession, options) {
      if (registry.active) {
        // Factory closures retain these values until Pi rebuilds the runtime.
        // TUI binding can happen after settings have already changed.
        registry.building.set(this, {
          cwd: nativeSession(this)._cwd,
          shellPath: this.settingsManager.getShellPath(),
          commandPrefix: this.settingsManager.getShellCommandPrefix()
        });
      }

      try {
        return build.call(this, options);
      } finally {
        registry.building.delete(this);
      }
    });

    this.installedRefresh = function (this: AgentSession, options) {
      if (registry.active) {
        try {
          registry.refresh(this);
        } catch {
          registry.warning("native binding unavailable; keeping original execution.");
        }
      }

      const result = refresh.call(this, options);

      if (registry.active) {
        try {
          registry.display(this)?.refreshAdapters();
        } catch {
          registry.warning("late tool contract unavailable; retaining generic historical cards.");
        }
      }

      return result;
    };

    hooks.replace(prototype, "_refreshToolRegistry", this.installedRefresh);
  }
  isNative(session: AgentSession, name: string): boolean {
    const internal = nativeSession(session);
    if (internal._baseToolsOverride !== undefined) return false;
    const current = session.getToolDefinition(name);
    const source = session.getAllTools().find((tool) => tool.name === name)?.sourceInfo.source;
    if (source !== "builtin") return false;
    const known = this.pristine.get(session)?.definitions.get(name);
    const observation = this.observed.get(session)?.get(name);

    return (
      !!current &&
      !!known &&
      ((current === observation?.replacement && unchangedDefinition(current, observation.fields)) ||
        (current === known.definition && unchangedDefinition(current, known.fields)))
    );
  }
  bind(session: AgentSession, eligible: () => boolean): void {
    const internal = nativeSession(session);
    if (this.pristine.has(session) && typeof internal._refreshToolRegistry === "function") {
      if (eligible()) internal._refreshToolRegistry.call(session);
    } else if (internal._baseToolsOverride === undefined)
      this.warning(
        "native construction contract unavailable; keeping original native cards and disabling observation."
      );
  }
  private capture(session: AgentSession): void {
    const internal = nativeSession(session);
    const settings = this.building.get(session);
    if (settings && internal._refreshToolRegistry === this.installedRefresh)
      this.pristine.set(session, {
        settings,
        definitions: new Map(
          [...internal._baseToolDefinitions].map(([name, definition]) => [
            name,
            { definition, fields: { ...definition } }
          ])
        )
      });
  }
  private refresh(session: AgentSession): void {
    const internal = nativeSession(session);
    if (
      !(internal._baseToolDefinitions instanceof Map) ||
      internal._baseToolsOverride !== undefined
    )
      return;
    this.capture(session);
    const display = this.display(session);
    const construction = this.pristine.get(session);
    if (!display || !construction) return;
    const owned = this.observed.get(session) ?? new Map<string, ObservedDefinition>();
    this.observed.set(session, owned);
    const customNames = new Set([
      ...session.extensionRunner.getAllRegisteredTools().map((tool) => tool.definition.name),
      ...internal._customTools.map((tool) => tool.name)
    ]);

    for (const name of ["bash", "powershell", "edit", "write"]) {
      const original = construction.definitions.get(name);
      const current = internal._baseToolDefinitions.get(name);
      const previous = owned.get(name);
      const eligible =
        this.active &&
        display.settings.valid &&
        (display.settings.rendererOverrides[name] ?? "auto") === "auto" &&
        !customNames.has(name);

      if (!eligible) {
        if (
          previous &&
          current === previous.replacement &&
          unchangedDefinition(current, previous.fields)
        )
          internal._baseToolDefinitions.set(name, previous.original);
        owned.delete(name);
        continue;
      }

      if (previous && current === previous.replacement) continue;
      if (
        !original ||
        current !== original.definition ||
        !unchangedDefinition(current, original.fields)
      )
        continue;
      const replacement = observeNativeDefinition(current, construction.settings, (id) =>
        this.active ? this.display(session)?.beginObservation(id, `pi:${name}`) : undefined
      );
      owned.set(name, { original: current, replacement, fields: { ...replacement } });
      internal._baseToolDefinitions.set(name, replacement);
    }
  }
  dispose(): void {
    this.active = false;

    for (const [session, definitions] of this.observed) {
      const internal = nativeSession(session);
      let changed = false;

      for (const [name, { original, replacement, fields }] of definitions)
        if (
          internal._baseToolDefinitions.get(name) === replacement &&
          unchangedDefinition(replacement, fields)
        ) {
          internal._baseToolDefinitions.set(name, original);
          changed = true;
        }

      if (changed) {
        try {
          internal._refreshToolRegistry.call(session);
        } catch {
          /* Retained execution wrapper is inert. */
        }
      }
    }

    this.observed.clear();
  }
}
