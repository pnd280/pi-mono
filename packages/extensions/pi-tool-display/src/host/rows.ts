import {
  AssistantMessageComponent,
  CustomMessageComponent,
  ToolExecutionComponent
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import { noticeSummary } from "../adapters/pi-nested-instructions/index.ts";
import type { DisplayAction, DisplayCall, SummaryNotice } from "../contracts.ts";
import type { DisplayTheme } from "../rendering/types.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { isInstructionNotice } from "../transcript/messages.ts";
import { record } from "../values.ts";
import { assistantBoundaryKind, bindAssistantPresentation } from "./assistant.ts";
import type { Host } from "./compatibility.ts";
import { bindRowChrome } from "./row-layout.ts";

/** Pi row ownership, visible separators, and input routing for one transcript binding. */
export class TranscriptRows {
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
    private host: Pick<Host, "ui" | "chatContainer" | "toolOutputExpanded">,
    private coordinator: TranscriptCoordinator,
    private options: {
      active: () => boolean;
      styleAssistant: boolean;
      /** Pi's row contract is recognized; otherwise rows keep Pi's own chrome. */
      chrome: boolean;
      /** Without mode hooks, Pi's global expansion toggles collapsed mode and verbose. */
      syncMode?: () => void;
      boundary?: (call: DisplayCall, kind: "group" | "run") => void;
      action?: (action: DisplayAction) => void;
    }
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
    const instructionNotice = isInstructionNotice(message);
    const summary = instructionNotice ? noticeSummary(record(message).details) : undefined;

    for (const component of this.indexChildren()) {
      if (
        instructionNotice &&
        this.options.chrome &&
        this.options.styleAssistant &&
        component instanceof CustomMessageComponent &&
        this.bindNotice(component, summary)
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

    if (call) {
      this.coordinator.boundary(call);
      this.options.boundary?.(call, "run");
    }
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
