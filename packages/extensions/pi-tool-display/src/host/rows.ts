import { AssistantMessageComponent, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DisplayCall, TranscriptView } from "../contracts.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { record } from "../values.ts";
import { assistantBoundaryKind, bindAssistantPresentation } from "./assistant.ts";
import type { Host } from "./compatibility.ts";

/** Pi 0.87.1 renders a margin row, its self-rendered rows (selfRenderHeight), then images. */
function selfRenderedRows(row: ToolExecutionComponent, rows: string[]): string[] {
  const height = record(row).selfRenderHeight;
  if (typeof height !== "number") return rows;

  return height > 0 ? rows.slice(0, height + 1) : [];
}

/** Pi 0.87.1 prepends a margin row and subtracts it in handleMouse. Join compact
 * members without moving native image components or replacing Pi's mouse routing.
 * Collapsed summary runs hide member rows entirely and never render images.
 */
function joinGroupedRow(
  row: ToolExecutionComponent,
  call: DisplayCall,
  coordinator: TranscriptView,
  active: () => boolean
): () => void {
  const hooks = new OwnedHooks();
  // Retain Pi's unbound methods and rebind their original receiver when delegating.
  // oxlint-disable-next-line typescript/unbound-method
  const previousRender = row.render;
  // oxlint-disable-next-line typescript/unbound-method
  const previousMouse = row.handleMouse;
  let removedMargin = false;
  let hidden = false;
  let movedFooter: { from: number; to: number } | undefined;

  const render: typeof row.render = function (this: ToolExecutionComponent, width) {
    movedFooter = undefined;
    const rows = previousRender.call(this, width);
    const role = active() ? coordinator.summaryRole(call) : undefined;
    hidden = role?.kind === "hidden";

    if (hidden) {
      removedMargin = false;

      return [];
    }

    const visible = role ? selfRenderedRows(this, rows) : rows;
    const group = active() && !role && !call.expanded ? coordinator.group(call) : undefined;
    removedMargin = !!group && group.members[0] !== call && visible[0] === "";

    const joined = removedMargin ? visible.slice(1) : visible;
    const height = record(this).selfRenderHeight;

    // Pi appends images after both renderer slots. Move the last member's footer
    // and its leading padding below those rows, leaving native images untouched.
    if (
      width > 0 &&
      active() &&
      coordinator.run(call)?.members.at(-1) === call &&
      coordinator.collapsible(call) &&
      typeof height === "number" &&
      height > 0
    ) {
      const from = height - Number(removedMargin);
      const footer = joined[from];

      if (footer !== undefined && from < joined.length - 1) {
        movedFooter = { from, to: joined.length - 1 };

        return [...joined.slice(0, from - 1), ...joined.slice(from + 1), "", footer];
      }
    }

    return joined;
  };

  const handleMouse: typeof row.handleMouse = function (this: ToolExecutionComponent, event) {
    if (hidden && active()) return undefined;

    if (active() && movedFooter && event.y >= movedFooter.from - 1) {
      if (
        (event.y === movedFooter.to || event.y === movedFooter.to - 1) &&
        event.type === "click" &&
        event.button === "left" &&
        coordinator.collapsible(call)
      ) {
        return previousMouse.call(this, {
          ...event,
          y: movedFooter.from + event.y - movedFooter.to + Number(removedMargin),
          height: event.height + Number(removedMargin)
        });
      }

      // Image rows are outside Pi's self-rendered mouse region. In particular,
      // their new first row must not hit the footer's former slot coordinates.
      return undefined;
    }

    return previousMouse.call(
      this,
      removedMargin && active() ? { ...event, y: event.y + 1, height: event.height + 1 } : event
    );
  };

  // Owned hooks unwind in reverse order: restore rendering before mouse routing.
  hooks.replace(row, "handleMouse", handleMouse);
  hooks.replace(row, "render", render);

  return () => {
    removedMargin = false;
    hidden = false;
    movedFooter = undefined;
    hooks.restore();
  };
}

/** Pi row ownership, visible separators, and input routing for one transcript binding. */
export class TranscriptRows {
  private disposers: (() => void)[] = [];
  private bound = new WeakSet<ToolExecutionComponent>();
  private assistants = new WeakSet<AssistantMessageComponent>();
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
  constructor(
    private host: Pick<Host, "ui" | "chatContainer" | "toolOutputExpanded">,
    private coordinator: TranscriptCoordinator,
    private options: {
      active: () => boolean;
      styleAssistant: boolean;
      /** Without mode hooks, Pi's global expansion toggles collapsed mode and verbose. */
      syncMode?: () => void;
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
  finishInsertion(): void {
    for (const component of this.indexChildren()) this.boundaryBefore(component);
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
      this.disposers.push(joinGroupedRow(child, call, coordinator, this.options.active));
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
    this.components.clear();
    this.children = undefined;
    this.lastChild = undefined;
    this.lastCall = undefined;
    this.predecessors = new WeakMap();
  }
}
