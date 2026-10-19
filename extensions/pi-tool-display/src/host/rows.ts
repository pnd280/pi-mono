import {
  AssistantMessageComponent,
  CustomMessageComponent,
  ToolExecutionComponent
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import { instructionNotice } from "../adapters/pi-nested-instructions/notices.ts";
import type {
  DisplayAction,
  DisplayCall,
  SummaryNotice,
  ToolDisplayAdapter
} from "../contracts.ts";
import { createToolDisplayRenderers } from "../rendering/cards.ts";
import type {
  CardRendererOptions,
  DisplayTheme,
  ToolDisplayRenderers
} from "../rendering/types.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { record } from "../values.ts";
import { assistantBoundaryKind, bindAssistantPresentation } from "./assistant.ts";
import type { Host, RenderDefinition } from "./compatibility.ts";
import { bindRowChrome } from "./row-layout.ts";

type RowHost = Pick<Host, "ui" | "chatContainer" | "toolOutputExpanded" | "streamingComponent">;

export type RowOptions = {
  styleAssistant: boolean;
  /** Pi's row contract is recognized; otherwise rows keep Pi's own chrome. */
  chrome: boolean;
  /** Without mode hooks, Pi's global expansion toggles collapsed mode and verbose. */
  syncMode?: () => void;
  action?: (action: DisplayAction) => void;
};

/**
 * One host's Pi rows: row ownership, visible separators, and input routing. Each
 * transcript binding gets new row state; release drops it, and callbacks that
 * outlive their binding become inert.
 */
export class TranscriptRows {
  private binding: RowBinding | undefined;

  constructor(private host: RowHost) {}

  /** Bind rows to a transcript; this releases the rows of the previous binding. */
  attach(coordinator: TranscriptCoordinator, options: RowOptions): void {
    this.release();
    const binding: RowBinding = new RowBinding(this.host, coordinator, {
      ...options,
      active: () => this.binding === binding
    });
    this.binding = binding;
  }

  release(): void {
    const binding = this.binding;
    this.binding = undefined;
    binding?.dispose();
  }

  /**
   * A tool definition view with renderer slots. Lookup has only a tool name; Pi
   * supplies the exact call ID when it constructs the row's renderer slots, before
   * it inserts that row, so the slots claim their call on first use.
   */
  definition(
    definition: RenderDefinition,
    name: string,
    adapter: ToolDisplayAdapter,
    options: Pick<CardRendererOptions, "showParameters" | "onFailure">
  ): RenderDefinition {
    const binding = this.binding;
    let renderers: ToolDisplayRenderers | undefined;

    const resolve = (id: string): ToolDisplayRenderers => {
      if (renderers) return renderers;
      const call = binding?.claimCall(name, id);
      renderers = createToolDisplayRenderers(name, adapter, {
        ...options,
        ...(call && binding ? { binding: { call, coordinator: binding.coordinator } } : {})
      });
      if (call) binding?.retainDefinition(view, call);

      return renderers;
    };

    const slots: ToolDisplayRenderers = {
      renderShell: "self",
      renderCall(args, theme, context) {
        binding?.useTheme(theme);

        return resolve(context.toolCallId).renderCall(args, theme, context);
      },
      renderResult(result, options, theme, context) {
        binding?.useTheme(theme);

        return resolve(context.toolCallId).renderResult(result, options, theme, context);
      }
    };
    const view = { ...definition, ...slots };

    return view;
  }

  /** Run a host insertion, then bind separators and notices to the rows it inserted. */
  insert<T>(run: () => T, message?: unknown): T {
    const binding = this.binding;
    binding?.prepareInsertion();
    const result = run();
    binding?.finishInsertion(message);

    return result;
  }

  /** Pi's `addMessageToChat`: an assistant row sets its boundary; other messages insert rows. */
  addMessage<T>(message: unknown, run: () => T): T {
    if (record(message).role !== "assistant") return this.insert(run, message);
    const binding = this.binding;
    const result = run();
    binding?.assistantBoundary(this.host.chatContainer?.children.at(-1));

    return result;
  }

  /**
   * Pi's `handleEvent`. A compaction inserts its summary into the binding that is
   * current when the event settles: success rebinds before it appends the summary,
   * and a failure appends notices to the original binding. A binding that outlives
   * the event binds its new rows.
   */
  async handleEvent(type: string, handle: () => Promise<void>): Promise<void> {
    const host = this.host;
    const binding = host.ui && host.chatContainer ? this.binding : undefined;
    // message_end updates the component and clears the host's streaming reference.
    const streaming = host.streamingComponent;
    const compaction = type === "compaction_end";
    if (compaction) binding?.prepareInsertion();
    await handle();
    if (compaction) this.binding?.finishInsertion();

    if (binding && this.binding === binding) {
      binding.assistantBoundary(host.streamingComponent ?? streaming);
      binding.bind();
    }
  }

  /** Bind Pi rows that reconstruction inserted. */
  bind(): void {
    this.binding?.bind();
  }
}

/** The row state of one transcript binding. */
class RowBinding {
  private disposers: (() => void)[] = [];
  private bound = new WeakSet<ToolExecutionComponent>();
  private assistants = new WeakSet<AssistantMessageComponent>();
  private notices = new WeakSet<CustomMessageComponent>();
  private trailingNotices = new Map<DisplayCall, CustomMessageComponent>();
  private pendingCalls = new Map<string, { calls: DisplayCall[]; next: number }>();
  private unindexedCalls: MapIterator<DisplayCall>;
  private indexedCalls = 0;
  private calls = new WeakMap<object, DisplayCall>();
  private children: readonly Component[] | undefined;
  private indexedChildren = 0;
  private lastChild: Component | undefined;
  private lastCall: DisplayCall | undefined;
  private components = new Set<Component>();
  private predecessors = new WeakMap<Component, DisplayCall>();
  private pendingRows = new Set<ToolExecutionComponent>();
  private theme: DisplayTheme | undefined;
  constructor(
    private host: RowHost,
    readonly coordinator: TranscriptCoordinator,
    private options: RowOptions & { active: () => boolean }
  ) {
    this.unindexedCalls = coordinator.calls.values();
  }
  claimCall(name: string, id: string): DisplayCall | undefined {
    if (!this.options.active()) return;

    // Calls are append-only until disposal. Stop at the indexed size rather than
    // exhausting the iterator, so later live calls remain visible to this cursor.
    while (this.indexedCalls < this.coordinator.calls.size) {
      const entry = this.unindexedCalls.next();
      if (entry.done) break;
      const call = entry.value;
      const queue = this.pendingCalls.get(call.reference.toolCallId) ?? { calls: [], next: 0 };
      queue.calls.push(call);
      this.pendingCalls.set(call.reference.toolCallId, queue);
      this.indexedCalls++;
    }

    const queue = this.pendingCalls.get(id);
    const call = queue?.calls[queue.next];
    if (!queue || call?.name !== name) return undefined;
    queue.next++;
    if (queue.next === queue.calls.length) this.pendingCalls.delete(id);

    return call;
  }
  retainDefinition(definition: object, call: DisplayCall): void {
    this.calls.set(definition, call);
  }
  /** Pi passes its theme only to renderers; row chrome reuses the latest one. */
  useTheme(theme: DisplayTheme): void {
    this.theme = theme;
  }
  private rowCall(row: ToolExecutionComponent): DisplayCall | undefined {
    const definition = record(row).toolDefinition;

    return definition !== null && typeof definition === "object"
      ? this.calls.get(definition)
      : undefined;
  }
  /** Pi appends rows during streaming and reconstruction. Only insertion/removal
   * within an indexed prefix needs a new predecessor pass, never ordinary events.
   */
  private indexChildren(): Component[] {
    if (!this.options.active()) return [];
    const children = this.host.chatContainer?.children;
    if (!children) return [];
    const previous = this.components;

    if (
      children !== this.children ||
      children.length < this.indexedChildren ||
      (this.indexedChildren > 0 && children[this.indexedChildren - 1] !== this.lastChild)
    ) {
      this.children = children;
      this.indexedChildren = 0;
      this.lastCall = undefined;
      this.components = new Set();
      this.predecessors = new WeakMap();
      this.pendingRows.clear();
    }

    const added: Component[] = [];

    for (; this.indexedChildren < children.length; this.indexedChildren++) {
      const child = children[this.indexedChildren];
      if (!child) continue;
      if (!previous.has(child)) added.push(child);
      this.components.add(child);
      if (this.lastCall) this.predecessors.set(child, this.lastCall);
      if (!(child instanceof ToolExecutionComponent)) continue;
      const call = this.rowCall(child);
      if (call) this.lastCall = call;
      if (call && !this.bound.has(child)) this.pendingRows.add(child);
    }

    this.lastChild = children.at(-1);

    return added;
  }
  /** Capture actual insertions, including custom entries inserted before a
   * streaming assistant. No-op notice hooks neither copy nor scan old children.
   */
  prepareInsertion(): void {
    this.indexChildren();
  }
  finishInsertion(message?: unknown): void {
    const notice = instructionNotice(message);

    for (const component of this.indexChildren()) {
      if (
        notice &&
        this.options.chrome &&
        this.options.styleAssistant &&
        component instanceof CustomMessageComponent &&
        this.bindNotice(component, notice.summary)
      )
        continue;
      this.boundaryBefore(component);
    }
  }
  /** A notice joins the preceding owned run, never crossing a visible run boundary.
   * Inspect actual rows: reconstruction may already have indexed later messages.
   */
  private bindNotice(row: CustomMessageComponent, summary: SummaryNotice | undefined): boolean {
    const children = this.host.chatContainer?.children ?? [];
    let call: DisplayCall | undefined;

    for (let index = children.indexOf(row) - 1; index >= 0; index--) {
      const previous = children[index];
      if (previous instanceof CustomMessageComponent && this.notices.has(previous)) continue;
      if (
        previous instanceof AssistantMessageComponent &&
        assistantBoundaryKind(previous) !== "run"
      )
        continue;
      if (previous instanceof ToolExecutionComponent) call = this.rowCall(previous);
      break;
    }

    if (!call) return false;
    this.notices.add(row);
    this.trailingNotices.set(call, row);
    this.coordinator.setBoundary(row, call, "group");
    if (summary) this.coordinator.addSummaryNotice(call, summary);
    const anchor = call;
    this.disposers.push(
      bindRowChrome(row, anchor, this.coordinator, {
        active: this.options.active,
        theme: () => this.theme,
        tail: () => this.trailingNotices.get(anchor) === row
      }),
      this.coordinator.attach(anchor, {
        invalidate: () => {
          row.invalidate();
          this.host.ui?.requestRender();
        },
        requestRender: () => this.host.ui?.requestRender(),
        // Pi owns notice expansion; expanding a tool group must not toggle notices.
        setExpanded: () => {}
      })
    );

    return true;
  }
  private precedingCall(component: Component): DisplayCall | undefined {
    if (!this.options.active()) return;
    this.indexChildren();

    return this.predecessors.get(component);
  }
  boundaryBefore(component: Component): void {
    const call = this.precedingCall(component);

    if (call) this.coordinator.boundary(call);
  }
  assistantBoundary(component: Component | undefined): void {
    if (!this.options.active()) return;
    // Pi keeps rendered text/thinking and generated errors in a child Container.
    // Final-message middleware can remove previously visible streaming content.
    if (!(component instanceof AssistantMessageComponent)) return;

    if (this.options.styleAssistant && !this.assistants.has(component)) {
      this.assistants.add(component);
      const dispose = bindAssistantPresentation(component, () => {
        if (this.options.active()) this.assistantBoundary(component);
      });
      if (dispose) this.disposers.push(dispose);
    }

    const kind = assistantBoundaryKind(component);
    this.coordinator.setBoundary(component, kind ? this.precedingCall(component) : undefined, kind);
  }
  bind(): void {
    // A host event may reconstruct the transcript before its original handler returns.
    if (!this.options.active()) return;
    const coordinator = this.coordinator;
    this.indexChildren();

    for (const child of this.pendingRows) {
      this.pendingRows.delete(child);
      const call = this.rowCall(child);
      if (!call) continue;
      this.bound.add(child);
      if (this.options.chrome)
        this.disposers.push(
          bindRowChrome(child, call, coordinator, {
            action: this.options.action,
            active: this.options.active,
            theme: () => this.theme,
            tail: () => !this.trailingNotices.has(call)
          })
        );
      // Retain Pi's expansion callback and explicitly rebind its original receiver.
      // oxlint-disable-next-line typescript/unbound-method
      const previous = child.setExpanded;

      const setExpanded = (expanded: boolean) => {
        if (this.options.active()) {
          this.options.syncMode?.();
          coordinator.expand(call, expanded);
        }
        // Later wrappers can retain this callback after disposal or reconstruction.
        else previous.call(child, expanded);
      };

      const hooks = new OwnedHooks();
      hooks.replace(child, "setExpanded", setExpanded);
      const detach = coordinator.attach(call, {
        invalidate: () => {
          child.invalidate();
          this.host.ui?.requestRender();
        },
        requestRender: () => this.host.ui?.requestRender(),
        setExpanded: (expanded) => previous.call(child, expanded)
      });
      previous.call(
        child,
        coordinator.group(call)?.expanded ??
          (coordinator.mode === "verbose" || (this.host.toolOutputExpanded ?? false))
      );
      this.disposers.push(() => {
        detach();
        hooks.restore();
      });
    }
  }
  dispose(): void {
    this.disposers.splice(0).forEach((dispose) => dispose());
    this.pendingCalls.clear();
    this.pendingRows.clear();
    this.trailingNotices.clear();
    this.components.clear();
    this.children = undefined;
    this.lastChild = undefined;
    this.lastCall = undefined;
    this.predecessors = new WeakMap();
  }
}
