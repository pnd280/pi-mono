import type { AgentSession, ToolDefinition, ToolInfo } from "@earendil-works/pi-coding-agent";

import { OwnedHooks } from "../owned-hooks/index.ts";
import {
  inspectedConstruction,
  nativePrototype,
  nativeSession,
  unchangedDefinition,
  type SessionInternals
} from "./compatibility.ts";

export interface NativeSettings {
  cwd: string;
  shellPath?: string | undefined;
  commandPrefix?: string | undefined;
}

export interface NativeToolObserver {
  names: readonly string[];
  eligible(session: AgentSession, name: string): boolean;
  wrap(session: AgentSession, original: ToolDefinition, settings: NativeSettings): ToolDefinition;
  refreshed?(session: AgentSession): void;
  warning?(message: string): void;
}

type Replacement = {
  original: ToolDefinition;
  replacement: ToolDefinition;
  fields: ToolDefinition;
  subscriber: { observer: NativeToolObserver };
};

type Construction = {
  settings: NativeSettings;
  definitions: Map<string, { definition: ToolDefinition; fields: ToolDefinition }>;
  replacements: Map<string, Replacement>;
};

const registryKey = Symbol.for("pi-mono.native-tools");

/** One provenance/restore boundary shared across independently loaded extensions. */
class NativeTools {
  private hooks = new OwnedHooks();
  private observers = new Set<{ observer: NativeToolObserver }>();
  private sessions = new WeakMap<AgentSession, Construction>();
  private sessionRefs = new Set<WeakRef<AgentSession>>();
  private building = new WeakMap<AgentSession, NativeSettings>();
  private active = true;
  private installedRefresh: SessionInternals["_refreshToolRegistry"] | undefined;

  constructor() {
    const prototype = nativePrototype();
    if (!inspectedConstruction(prototype)) return;
    const build = prototype._buildRuntime;
    const refresh = prototype._refreshToolRegistry;
    const registry = this;
    this.hooks.replace(prototype, "_buildRuntime", function (this: AgentSession, options) {
      if (registry.active)
        registry.building.set(this, {
          cwd: nativeSession(this)._cwd,
          shellPath: this.settingsManager.getShellPath(),
          commandPrefix: this.settingsManager.getShellCommandPrefix()
        });

      try {
        return build.call(this, options);
      } finally {
        registry.building.delete(this);
      }
    });

    this.installedRefresh = function (this: AgentSession, options) {
      if (registry.active) registry.safely(() => registry.refresh(this));
      const result = refresh.call(this, options);
      if (registry.active)
        for (const { observer } of registry.observers)
          registry.safely(() => observer.refreshed?.(this));

      return result;
    };

    this.hooks.replace(prototype, "_refreshToolRegistry", this.installedRefresh);
  }

  private safely<T>(action: () => T): T | undefined {
    try {
      return action();
    } catch {
      for (const { observer } of this.observers)
        try {
          observer.warning?.("Native observation unavailable; keeping original execution.");
        } catch {
          // Diagnostics cannot change tool execution.
        }

      return undefined;
    }
  }

  subscribe(observer: NativeToolObserver) {
    const subscriber = { observer };
    this.observers.add(subscriber);
    if (!this.installedRefresh)
      this.safely(() =>
        observer.warning?.("Native construction contract unavailable; keeping original execution.")
      );
    for (const session of this.knownSessions()) this.bind(session);
    let subscribed = true;

    return {
      isNative: (session: AgentSession, name: string, tool?: ToolInfo) =>
        this.isNative(session, name, tool),
      bind: (session: AgentSession) => this.bind(session),
      bindSessionManager: (manager: object) => {
        for (const session of this.knownSessions())
          if (session.sessionManager === manager) this.bind(session);
      },
      dispose: () => {
        if (!subscribed) return;
        subscribed = false;
        this.observers.delete(subscriber);
        for (const session of this.knownSessions()) this.bind(session);
        if (this.observers.size) return;
        this.active = false;
        this.hooks.restore();
        this.sessions = new WeakMap();
        this.sessionRefs.clear();
        const prototype: SessionInternals & { [registryKey]?: NativeTools } = nativePrototype();
        if (prototype[registryKey] === this) delete prototype[registryKey];
      }
    };
  }

  private *knownSessions(): Generator<AgentSession> {
    for (const ref of this.sessionRefs) {
      const session = ref.deref();
      if (session) yield session;
      else this.sessionRefs.delete(ref);
    }
  }

  /** `tool` is the caller's registry info for `name`; Pi builds every tool's info to look it up. */
  private isNative(session: AgentSession, name: string, tool?: ToolInfo): boolean {
    if (nativeSession(session)._baseToolsOverride !== undefined) return false;
    const current = session.getToolDefinition(name);
    const construction = this.sessions.get(session);
    const original = construction?.definitions.get(name);
    const observed = construction?.replacements.get(name);
    if (
      !current ||
      !original ||
      !(
        (current === observed?.replacement && unchangedDefinition(current, observed.fields)) ||
        (current === original.definition && unchangedDefinition(current, original.fields))
      )
    )
      return false;
    const info = tool ?? session.getAllTools().find((candidate) => candidate.name === name);

    return info?.sourceInfo.source === "builtin";
  }

  private bind(session: AgentSession): void {
    if (this.sessions.has(session))
      this.safely(() => {
        if (this.refresh(session)) nativeSession(session)._refreshToolRegistry.call(session);
      });
  }

  private refresh(session: AgentSession): boolean {
    const internal = nativeSession(session);
    if (
      !(internal._baseToolDefinitions instanceof Map) ||
      internal._baseToolsOverride !== undefined
    )
      return false;
    const settings = this.building.get(session);

    if (settings && internal._refreshToolRegistry === this.installedRefresh) {
      if (!this.sessions.has(session)) this.sessionRefs.add(new WeakRef(session));
      this.sessions.set(session, {
        settings,
        definitions: new Map(
          [...internal._baseToolDefinitions].map(([name, definition]) => [
            name,
            { definition, fields: { ...definition } }
          ])
        ),
        replacements: new Map()
      });
    }

    const construction = this.sessions.get(session);
    if (!construction) return false;
    let changed = false;
    const customNames = new Set([
      ...session.extensionRunner.getAllRegisteredTools().map((tool) => tool.definition.name),
      ...internal._customTools.map((tool) => tool.name)
    ]);

    for (const [name, original] of construction.definitions) {
      const previous = construction.replacements.get(name);
      const current = internal._baseToolDefinitions.get(name);
      const subscriber = customNames.has(name)
        ? undefined
        : [...this.observers].find(
            ({ observer }) =>
              observer.names.includes(name) && this.safely(() => observer.eligible(session, name))
          );
      if (previous && current === previous.replacement && subscriber === previous.subscriber)
        continue;

      if (
        previous &&
        current === previous.replacement &&
        unchangedDefinition(current, previous.fields)
      ) {
        internal._baseToolDefinitions.set(name, previous.original);
        changed = true;
      }

      construction.replacements.delete(name);
      if (
        !subscriber ||
        internal._baseToolDefinitions.get(name) !== original.definition ||
        !unchangedDefinition(original.definition, original.fields)
      )
        continue;
      const observed = this.safely(() =>
        subscriber.observer.wrap(session, original.definition, construction.settings)
      );
      if (!observed) continue;
      const registry = this;
      const replacement: ToolDefinition = {
        ...observed,
        execute(...args) {
          return registry.active && registry.observers.has(subscriber)
            ? observed.execute(...args)
            : original.definition.execute(...args);
        }
      };
      construction.replacements.set(name, {
        original: original.definition,
        replacement,
        fields: { ...replacement },
        subscriber
      });
      internal._baseToolDefinitions.set(name, replacement);
      changed = true;
    }

    return changed;
  }
}

/** Subscribe before session construction. Never recreates custom/SDK tool closures. */
export function observeNativeTools(observer: NativeToolObserver) {
  const prototype: SessionInternals & { [registryKey]?: NativeTools } = nativePrototype();
  let registry = prototype[registryKey];

  if (!registry) {
    registry = new NativeTools();
    prototype[registryKey] = registry;
  }

  return registry.subscribe(observer);
}
