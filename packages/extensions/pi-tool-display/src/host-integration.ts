import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  AgentSession,
  AssistantMessageComponent,
  CONFIG_DIR_NAME,
  getAgentDir,
  InteractiveMode,
  ToolExecutionComponent,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { Container, type Component, type TUI } from "@earendil-works/pi-tui";

import { selectAdapter } from "./adapters/registry.ts";
import type { CallReference, DisplayCall, DisplayFact } from "./display-model.ts";
import { observeNativeDefinition, type NativeSettings } from "./native-observation.ts";
import { record, stringField } from "./presentation.ts";
import { createToolDisplayRenderers } from "./renderers.ts";
import { SavedOutputLoader } from "./saved-output.ts";
import { persistDisplayFact, readDisplayRecords, referenceKey } from "./session-metadata.ts";
import { loadDisplaySettings, type DisplaySettings } from "./settings.ts";
import { TranscriptCoordinator } from "./transcript-coordinator.ts";

// All private Pi 0.85.1 accesses stay in this adapter. Neither renderers nor the
// coordinator knows about registry wrapping, transcript construction, or row fields.
type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

interface SessionInternals {
  _cwd: string;
  _baseToolsOverride?: unknown;
  _baseToolDefinitions: Map<string, ToolDefinition>;
  _customTools: ToolDefinition[];
  _buildRuntime: (this: AgentSession, options: unknown) => void;
  _refreshToolRegistry: (this: AgentSession, options?: unknown) => void;
}

interface Host {
  session: AgentSession;
  ui?: TUI;
  chatContainer?: { children: Component[] };
  toolOutputExpanded?: boolean;
  streamingComponent?: AssistantMessageComponent;
  addMessageToChat?: (this: Host, message: unknown, options?: unknown) => void;
  addCustomEntryToChat?: (this: Host, entry: unknown) => void;
  getRegisteredToolDefinition: (this: Host, name: string) => RenderDefinition;
  renderSessionItems: (this: Host, items: unknown[], options?: unknown) => void;
  handleEvent: (this: Host, event: AgentSessionEvent) => Promise<void>;
  maybeShowAssistantDiagnostics?: (this: Host, message: unknown) => void;
  addCacheMissNotice?: (this: Host, notice: unknown) => void;
}

interface Binding {
  host: Host;
  coordinator: TranscriptCoordinator;
  output: SavedOutputLoader;
  settings: DisplaySettings;
  rowDisposers: (() => void)[];
  boundRows: WeakSet<ToolExecutionComponent>;
  decorated: Set<string>;
  messages: Set<string>;
  metadata: ReturnType<typeof readDisplayRecords>;
}

interface ObservedDefinition {
  original: ToolDefinition;
  replacement: ToolDefinition;
  fields: ToolDefinition;
}

function unchangedDefinition(definition: ToolDefinition, fields: ToolDefinition): boolean {
  return (
    Object.keys(definition).length === Object.keys(fields).length &&
    Object.keys(fields).every((key) => Reflect.get(definition, key) === Reflect.get(fields, key))
  );
}

/** Pi 0.85.1's self shell prepends one margin row and subtracts it in handleMouse.
 * Join adjacent compact members without moving their native image components or
 * replacing Pi's mouse routing. Expanded and unrelated cards retain the margin.
 */
function joinGroupedRow(
  row: ToolExecutionComponent,
  call: DisplayCall,
  coordinator: TranscriptCoordinator,
  active: () => boolean
): () => void {
  // Preserve unbound method identity for conditional restoration; calls rebind this.
  // oxlint-disable-next-line typescript/unbound-method
  const previousRender = row.render;
  // oxlint-disable-next-line typescript/unbound-method
  const previousMouse = row.handleMouse;
  let removedMargin = false;

  const render: typeof row.render = function (this: ToolExecutionComponent, width) {
    const rows = previousRender.call(this, width);
    const group = active() && !call.expanded ? coordinator.group(call) : undefined;
    removedMargin = !!group && group.members[0] !== call && rows[0] === "";

    return removedMargin ? rows.slice(1) : rows;
  };

  const handleMouse: typeof row.handleMouse = function (this: ToolExecutionComponent, event) {
    return previousMouse.call(
      this,
      removedMargin && active() ? { ...event, y: event.y + 1, height: event.height + 1 } : event
    );
  };

  row.render = render;
  row.handleMouse = handleMouse;

  return () => {
    removedMargin = false;
    if (row.render === render) row.render = previousRender;
    if (row.handleMouse === handleMouse) row.handleMouse = previousMouse;
  };
}

const hook = Symbol.for("pi-tool-display.hostIntegration");

type Prototype = Host & { [hook]?: () => void };

// Pi 0.85.1 declares these registry fields private. The construction fingerprints below
// gate observation; retaining this explicit boundary also permits conditional restoration.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const nativeSession = (session: AgentSession) => session as unknown as SessionInternals;

function hostToolResult(value: unknown): NonNullable<DisplayCall["result"]> {
  // Pi's execution events and persisted toolResult messages carry AgentToolResult media
  // blocks, but its event API erases the payload type. Adapters still validate details.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as NonNullable<DisplayCall["result"]>;
}

// Factory closures hide their operations. Only Pi 0.85.1's inspected construction
// path establishes their settings; a pre-existing private wrapper is not evidence.
const constructionHashes = [
  {
    // Unbundled public API (dist/index.js).
    _buildRuntime: "a3ab89260460277fd6dff8c9f076bf16cf9e1a877ca5fbba63ac7f7cb93eb1d4",
    _refreshToolRegistry: "d29320d86ee266c910bb7e06774d49ecd8bb4c37e9006caa113f6472ab554818"
  },
  {
    // Published `pi` executable (dist/bundle/cli.js). Its extension imports use
    // the bundled classes, whose minified method bodies differ from the API.
    _buildRuntime: "0d5522f8f4e0dbe3fe7df897771cb738030377dccd69a27bcf44ffba8385c6e7",
    _refreshToolRegistry: "c7036f01afe7e60bf5556779e4c0b5f1c34ae6ea04eb937302c83bd0ed734e89"
  }
];

function inspectedConstruction(prototype: SessionInternals): boolean {
  return constructionHashes.some((expected) =>
    Object.entries(expected).every(([key, hash]) => {
      const method: unknown = Reflect.get(prototype, key);

      return (
        typeof method === "function" &&
        createHash("sha256").update(method.toString()).digest("hex") === hash
      );
    })
  );
}

export function installHostIntegration(
  append?: ExtensionAPI["appendEntry"],
  warn: (message: string) => void = () => {}
): (() => void) | undefined {
  // Private Pi 0.85.1 hook contracts; method availability and construction are checked below.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const prototype = InteractiveMode.prototype as unknown as Prototype;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const sessionPrototype = AgentSession.prototype as unknown as SessionInternals;
  prototype[hook]?.();
  const previousLookup = prototype.getRegisteredToolDefinition;
  if (typeof previousLookup !== "function") return undefined;
  const restorations: (() => void)[] = [];
  const bindings = new Set<Binding>();
  const hosts = new WeakMap<Host, Binding>();
  const sessions = new WeakMap<AgentSession, Binding>();
  const pristine = new WeakMap<
    AgentSession,
    {
      settings: NativeSettings;
      definitions: Map<string, { definition: ToolDefinition; fields: ToolDefinition }>;
    }
  >();
  const observed = new Map<AgentSession, Map<string, ObservedDefinition>>();
  const building = new WeakMap<AgentSession, NativeSettings>();
  const canObserveNative = inspectedConstruction(sessionPrototype);
  let installedRefresh: SessionInternals["_refreshToolRegistry"] | undefined;
  let active = true;

  const warning = (text: string) => {
    try {
      warn(`pi-tool-display: ${text}`);
    } catch {
      /* UI may already be disposed. */
    }
  };

  function settings(session: AgentSession): DisplaySettings {
    const manager = session.settingsManager;

    const storage = record(record(manager).storage);

    return loadDisplaySettings([
      {
        path:
          typeof storage.globalSettingsPath === "string"
            ? storage.globalSettingsPath
            : join(getAgentDir(), "settings.json"),
        settings: manager.getGlobalSettings()
      },
      ...(manager.isProjectTrusted()
        ? [
            {
              path:
                typeof storage.projectSettingsPath === "string"
                  ? storage.projectSettingsPath
                  : join(session.sessionManager.getCwd(), CONFIG_DIR_NAME, "settings.json"),
              settings: manager.getProjectSettings()
            }
          ]
        : [])
    ]);
  }

  function native(session: AgentSession, name: string): boolean {
    const internal = nativeSession(session);
    if (internal._baseToolsOverride !== undefined) return false;
    const current = session.getToolDefinition(name);
    const source = session.getAllTools().find((tool) => tool.name === name)?.sourceInfo.source;
    if (source !== "builtin") return false;
    const known = pristine.get(session)?.definitions.get(name);
    const observation = observed.get(session)?.get(name);

    return (
      !!current &&
      !!known &&
      ((current === observation?.replacement && unchangedDefinition(current, observation.fields)) ||
        (current === known.definition && unchangedDefinition(current, known.fields)))
    );
  }

  function adapter(session: AgentSession, name: string, configuration: DisplaySettings) {
    return selectAdapter(
      configuration,
      name,
      session.getToolDefinition(name),
      native(session, name),
      session.getAllTools().find((tool) => tool.name === name)
    );
  }

  function refreshHistoricalAdapters(session: AgentSession): void {
    const binding = sessions.get(session);
    if (!binding) return;

    // Extensions can register after Pi reconstructs history. Upgrade retained
    // generic rows once a verified contract exists, without replaying calls.
    for (const call of binding.coordinator.calls.values()) {
      if (call.origin !== "historical" || call.adapter.id !== "generic") continue;
      const selected = adapter(session, call.name, binding.settings);
      if (selected && selected.id !== "generic") binding.coordinator.setAdapter(call, selected);
    }
  }

  function observe(binding: Binding, call: DisplayCall, fact: DisplayFact) {
    if (!active || sessions.get(binding.host.session) !== binding) return;
    binding.coordinator.fact(call, fact);
    if (append && call.origin === "live")
      persistDisplayFact(append, call.reference, call.adapter.id, fact);
  }

  function captureNative(session: AgentSession): void {
    const internal = nativeSession(session);
    const settings = building.get(session);

    if (settings && internal._refreshToolRegistry === installedRefresh) {
      pristine.set(session, {
        settings,
        definitions: new Map(
          [...internal._baseToolDefinitions].map(([name, definition]) => [
            name,
            { definition, fields: { ...definition } }
          ])
        )
      });
    }
  }

  function refreshNative(session: AgentSession): void {
    const internal = nativeSession(session);
    if (
      !(internal._baseToolDefinitions instanceof Map) ||
      internal._baseToolsOverride !== undefined
    )
      return;
    captureNative(session);
    const binding = sessions.get(session);
    const construction = pristine.get(session);
    if (!binding || !construction) return;
    const owned = observed.get(session) ?? new Map<string, ObservedDefinition>();
    observed.set(session, owned);
    const customNames = new Set([
      ...session.extensionRunner.getAllRegisteredTools().map((tool) => tool.definition.name),
      ...internal._customTools.map((tool) => tool.name)
    ]);

    for (const name of ["bash", "powershell", "edit", "write"]) {
      const original = construction.definitions.get(name);
      const current = internal._baseToolDefinitions.get(name);
      const previous = owned.get(name);
      const eligible =
        active &&
        binding.settings.valid &&
        (binding.settings.rendererOverrides[name] ?? "auto") === "auto" &&
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
      const replacement = observeNativeDefinition(current, construction.settings, (id) => {
        const currentBinding = sessions.get(session);
        const call = currentBinding?.coordinator.byId(id);
        if (
          !active ||
          !currentBinding ||
          !call ||
          call.origin !== "live" ||
          call.adapter.id !== `pi:${name}`
        )
          return undefined;
        const source = session.sessionManager
          .getBranch()
          .reverse()
          .find(
            (entry) =>
              entry.type === "message" &&
              entry.message.role === "assistant" &&
              entry.message.timestamp === call.reference.messageTimestamp
          );
        if (source) call.reference.messageEntryId = source.id;

        return {
          started: () => currentBinding.coordinator.update(call, "executing"),
          fact: (fact) => observe(currentBinding, call, fact),
          preview: (output) => currentBinding.coordinator.preview(call, output)
        };
      });
      owned.set(name, { original: current, replacement, fields: { ...replacement } });
      internal._baseToolDefinitions.set(name, replacement);
    }
  }

  function release(binding: Binding) {
    binding.rowDisposers.forEach((dispose) => dispose());
    binding.coordinator.dispose();
    binding.output.dispose();
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
    const configuration = settings(host.session);
    configuration.warnings.forEach(warning);
    const coordinator = new TranscriptCoordinator(randomUUID());
    binding = {
      host,
      settings: configuration,
      coordinator,
      output: new SavedOutputLoader(undefined, (path) => {
        for (const call of coordinator.calls.values())
          if (call.savedOutput?.path === path) {
            delete call.savedOutput;
            coordinator.changed(call);
          }
      }),
      rowDisposers: [],
      boundRows: new WeakSet(),
      decorated: new Set(),
      messages: new Set(),
      metadata: readDisplayRecords(host.session.sessionManager.getBranch())
    };
    hosts.set(host, binding);
    sessions.set(host.session, binding);
    bindings.add(binding);
    const internal = nativeSession(host.session);
    if (pristine.has(host.session) && typeof internal._refreshToolRegistry === "function") {
      const eligible = ["bash", "powershell", "edit", "write"].some(
        (name) => adapter(host.session, name, configuration)?.id === `pi:${name}`
      );
      if (eligible) internal._refreshToolRegistry.call(host.session);
    } else if (internal._baseToolsOverride === undefined)
      warning(
        "native construction contract unavailable; keeping original native cards and disabling observation."
      );

    return binding;
  }

  function saved(binding: Binding, call: DisplayCall) {
    const path = call.savedPath;
    if (
      !path ||
      !call.expanded ||
      (call.savedOutput?.path === path && !call.savedOutput.retryable) ||
      call.lifecycle !== "complete"
    )
      return;
    void binding.output
      .load(path)
      .then((output) => {
        if (
          !active ||
          !output ||
          sessions.get(binding.host.session) !== binding ||
          call.savedPath !== path
        )
          return;
        call.savedOutput = output;
        binding.coordinator.changed(call);
      })
      .catch(() => {});
  }

  function retainPath(binding: Binding, call: DisplayCall, result: unknown) {
    if (!call.adapter.savedOutput) return;
    const path = record(record(result).details).fullOutputPath;
    if (typeof path === "string") call.savedPath = path;
    saved(binding, call);
  }

  function message(
    binding: Binding,
    input: unknown,
    origin: "live" | "historical",
    complete = true
  ) {
    const value = record(input);
    const coordinator = binding.coordinator;
    if (value.type === "custom") return; // The host may suppress or reposition this entry.
    if (value.role === "custom" && value.display === false) return;

    if (value.role === "toolResult") {
      const call = coordinator.byId(String(value.toolCallId));

      if (call && call.name === value.toolName) {
        coordinator.result(
          call,
          hostToolResult(input),
          value.isError === true ? "failure" : "success"
        );
        retainPath(binding, call, input);
      }

      return;
    }

    if (value.role !== "assistant" || !Array.isArray(value.content)) {
      coordinator.boundary();

      return;
    }

    const timestamp = Number(value.timestamp);
    const source = binding.host.session.sessionManager
      .getBranch()
      .reverse()
      .find(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "assistant" &&
          entry.message.timestamp === timestamp
      );
    value.content.forEach((block: unknown, index: number) => {
      const content = record(block);
      const position = `${timestamp}:${index}`;
      if (content.type !== "toolCall") return; // Pi renders assistant content before its tool rows.
      const name = String(content.name);
      const selected = adapter(binding.host.session, name, binding.settings);

      if (!selected) {
        if (!binding.messages.has(position)) coordinator.boundary();
        binding.messages.add(position);

        return;
      }

      const reference: CallReference = {
        messageTimestamp: timestamp,
        contentIndex: index,
        toolCallId: String(content.id),
        ...(source ? { messageEntryId: source.id } : {})
      };
      const call = coordinator.add(
        reference,
        name,
        content.arguments,
        selected,
        origin,
        binding.host.toolOutputExpanded ?? false
      );
      if (origin === "historical")
        for (const metadata of binding.metadata)
          if (
            metadata.adapter === call.adapter.id &&
            referenceKey(metadata.call) === referenceKey(reference)
          )
            coordinator.fact(call, metadata.fact);
      if (origin === "live" && complete) coordinator.update(call, "queued");
      finalizeInterruptedMessage(coordinator, call, value);
    });
  }

  function finalizeInterruptedMessage(
    coordinator: TranscriptCoordinator,
    call: DisplayCall,
    value: Record<string, unknown>
  ) {
    if (call.lifecycle === "complete") return;
    if (value.stopReason !== "aborted" && value.stopReason !== "error") return;
    const aborted = value.stopReason === "aborted";
    coordinator.result(
      call,
      {
        content: [
          {
            type: "text",
            text: aborted ? "Operation aborted" : stringField(value.errorMessage) || "Error"
          }
        ],
        details: undefined
      },
      aborted ? "cancelled" : "failure"
    );
  }

  function rowCall(row: ToolExecutionComponent): DisplayCall | undefined {
    const definition = record(row).toolDefinition;

    return definition !== null && typeof definition === "object"
      ? rowCalls.get(definition)
      : undefined;
  }

  function precedingCall(binding: Binding, component: Component): DisplayCall | undefined {
    if (!active || hosts.get(binding.host) !== binding) return;
    const children = binding.host.chatContainer?.children ?? [];

    for (let index = children.indexOf(component) - 1; index >= 0; index--) {
      const child = children[index];
      if (!(child instanceof ToolExecutionComponent)) continue;
      const call = rowCall(child);
      if (call) return call;
    }
  }

  function boundaryBefore(binding: Binding, component: Component): void {
    const call = precedingCall(binding, component);
    if (call) binding.coordinator.boundary(call);
  }

  function assistantBoundary(binding: Binding, component: Component | undefined): void {
    // Pi 0.85.1 keeps rendered text/thinking and generated errors in a child Container.
    // Final-message middleware can remove previously visible streaming content.
    if (!(component instanceof AssistantMessageComponent)) return;
    const visible = component.children.some(
      (child) => child instanceof Container && child.children.length > 0
    );
    binding.coordinator.setBoundary(
      component,
      visible ? precedingCall(binding, component) : undefined
    );
  }

  function compactionBoundary(host: Host, before: readonly Component[] | undefined): void {
    if (!before) return;
    const binding = hosts.get(host);
    const last = host.chatContainer?.children.at(-1);
    // Success reconstructs the binding; failures/cancellation can append notices without it.
    if (binding && last && !before.includes(last)) boundaryBefore(binding, last);
  }

  function bindRows(binding: Binding) {
    // A host event can reconstruct the transcript and replace its binding before returning.
    if (!active || hosts.get(binding.host) !== binding) return;

    for (const child of binding.host.chatContainer?.children ?? []) {
      if (!(child instanceof ToolExecutionComponent) || binding.boundRows.has(child)) continue;
      const call = rowCall(child);
      if (!call) continue;
      binding.boundRows.add(child);
      binding.rowDisposers.push(
        joinGroupedRow(
          child,
          call,
          binding.coordinator,
          () => active && hosts.get(binding.host) === binding
        )
      );
      // Preserve identity for restoration and explicitly rebind the original receiver.
      // oxlint-disable-next-line typescript/unbound-method
      const previous = child.setExpanded;

      const setExpanded = function (expanded: boolean) {
        if (active && hosts.get(binding.host) === binding)
          binding.coordinator.expand(call, expanded);
        // Later wrappers can retain this callback after disposal or reconstruction.
        else previous.call(child, expanded);
      };

      child.setExpanded = setExpanded;
      const detach = binding.coordinator.attach(call, {
        invalidate: () => {
          child.invalidate();
          binding.host.ui?.requestRender();
        },
        setExpanded: (expanded) => {
          previous.call(child, expanded);
          if (expanded) saved(binding, call);
        }
      });
      previous.call(
        child,
        binding.coordinator.group(call)?.expanded ?? binding.host.toolOutputExpanded ?? false
      );
      binding.rowDisposers.push(() => {
        detach();
        if (child.setExpanded === setExpanded) child.setExpanded = previous;
      });
    }
  }

  const rowCalls = new WeakMap<object, DisplayCall>();

  const lookup: Host["getRegisteredToolDefinition"] = function (this: Host, name) {
    const definition = previousLookup.call(this, name); // Exactly once; preserve failures.
    if (!active) return definition;

    try {
      const binding = hosts.get(this);
      const configuration = binding?.settings ?? settings(this.session);
      const selected = adapter(this.session, name, configuration);
      if (!selected) return definition;
      const call = binding
        ? [...binding.coordinator.calls.values()].find(
            (candidate) => candidate.name === name && !binding.decorated.has(candidate.key)
          )
        : undefined;
      if (call) binding!.decorated.add(call.key);
      const view = {
        ...definition,
        ...createToolDisplayRenderers(name, selected, {
          showParameters: configuration.showParameters,
          ...(call && binding ? { binding: { call, coordinator: binding.coordinator } } : {})
        })
      };
      if (call) rowCalls.set(view, call);

      return view;
    } catch {
      return definition;
    }
  };

  function replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]) {
    const previous = target[key];
    target[key] = value;
    restorations.push(() => {
      if (target[key] === value) target[key] = previous;
    });
  }

  const dispose = () => {
    if (!active) return;
    active = false;
    for (const binding of bindings) release(binding);

    for (const [session, definitions] of observed) {
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

    observed.clear();

    for (const restore of restorations.reverse()) {
      try {
        restore();
      } catch {
        /* A locked host can prevent removal, not deactivation. */
      }
    }

    if (prototype[hook] === dispose) delete prototype[hook];
  };

  try {
    replace(prototype, "getRegisteredToolDefinition", lookup);
    const build = sessionPrototype._buildRuntime;
    const refresh = sessionPrototype._refreshToolRegistry;

    if (canObserveNative) {
      replace(sessionPrototype, "_buildRuntime", function (this: AgentSession, options) {
        if (active) {
          // Factory closures retain these values until Pi rebuilds the runtime.
          // TUI binding can happen after settings have already changed.
          building.set(this, {
            cwd: nativeSession(this)._cwd,
            shellPath: this.settingsManager.getShellPath(),
            commandPrefix: this.settingsManager.getShellCommandPrefix()
          });
        }

        try {
          return build.call(this, options);
        } finally {
          building.delete(this);
        }
      });

      installedRefresh = function (this: AgentSession, options) {
        if (active) {
          try {
            refreshNative(this);
          } catch {
            warning("native binding unavailable; keeping original execution.");
          }
        }

        const result = refresh.call(this, options);

        if (active) {
          try {
            refreshHistoricalAdapters(this);
          } catch {
            warning("late tool contract unavailable; retaining generic historical cards.");
          }
        }

        return result;
      };

      replace(sessionPrototype, "_refreshToolRegistry", installedRefresh);
    }

    // Pi derives notices and can suppress custom entries or insert them before streaming
    // rows. Observe the actual insertion, not registration or the last indexed call.
    for (const key of [
      "maybeShowAssistantDiagnostics",
      "addCacheMissNotice",
      "addCustomEntryToChat"
    ] as const) {
      const insert = prototype[key];
      if (typeof insert !== "function") continue;
      replace(prototype, key, function (this: Host, value: unknown) {
        const binding = active ? hosts.get(this) : undefined;
        if (!binding) return insert.call(this, value);
        const before = this.chatContainer?.children.slice() ?? [];
        const result = insert.call(this, value);
        const children = this.chatContainer?.children ?? [];

        if (children.length > before.length) {
          const inserted = children.find((child, index) => child !== before[index]);
          if (inserted) boundaryBefore(binding, inserted);
        }

        return result;
      });
    }

    const addMessage = prototype.addMessageToChat;
    if (typeof addMessage === "function")
      replace(prototype, "addMessageToChat", function (this: Host, value, options) {
        const result = addMessage.call(this, value, options);
        const binding = active ? hosts.get(this) : undefined;
        if (binding && record(value).role === "assistant")
          assistantBoundary(binding, this.chatContainer?.children.at(-1));

        return result;
      });
    const reconstruct = prototype.renderSessionItems;
    const handle = prototype.handleEvent;
    if (typeof reconstruct === "function" && typeof handle === "function") {
      replace(prototype, "renderSessionItems", function (this: Host, items, options) {
        const binding = active ? ensure(this, true) : undefined;
        if (binding) for (const item of items) message(binding, item, "historical");
        const result = reconstruct.call(this, items, options);

        if (binding) {
          bindRows(binding);
          for (const call of binding.coordinator.calls.values()) saved(binding, call);
        }

        return result;
      });
      replace(prototype, "handleEvent", async function (this: Host, event) {
        const binding = active ? ensure(this) : undefined;

        if (binding) {
          if (
            event.type === "message_start" ||
            event.type === "message_update" ||
            event.type === "message_end"
          )
            message(binding, event.message, "live", event.type === "message_end");

          if (event.type === "tool_execution_start") {
            const call = binding.coordinator.byId(event.toolCallId);
            if (call) binding.coordinator.update(call, "queued");
          }

          if (event.type === "tool_execution_update" || event.type === "tool_execution_end") {
            const call = binding.coordinator.byId(event.toolCallId);

            if (call) {
              const result = hostToolResult(
                event.type === "tool_execution_update" ? event.partialResult : event.result
              );
              binding.coordinator.result(
                call,
                result,
                event.type === "tool_execution_end" && event.isError ? "failure" : "success",
                event.type === "tool_execution_update"
              );
              retainPath(binding, call, result);
            }
          }

          if (event.type === "agent_end") binding.coordinator.settle();
        }

        // message_end updates the component and clears the host's streaming reference.
        const streaming = this.streamingComponent;
        const compactionChildren =
          event.type === "compaction_end" ? this.chatContainer?.children.slice() : undefined;
        await handle.call(this, event);
        compactionBoundary(this, compactionChildren);

        if (binding) {
          assistantBoundary(binding, this.streamingComponent ?? streaming);
          bindRows(binding);
        }
      });
    } else warning("transcript row contract unavailable; grouping disabled.");
    prototype[hook] = dispose;

    return dispose;
  } catch {
    dispose();

    return undefined;
  }
}
