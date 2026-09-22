import { AssistantMessageComponent, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";

import type { DisplayCall, TranscriptView } from "../contracts.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { record } from "../values.ts";
import type { Host } from "./compatibility.ts";
import { bindThinkingVisibility } from "./thinking.ts";

/** Pi 0.87.0 prepends a margin row and subtracts it in handleMouse. Join compact
 * members without moving native image components or replacing Pi's mouse routing.
 */
function joinGroupedRow(
  row: ToolExecutionComponent,
  call: DisplayCall,
  coordinator: TranscriptView,
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
    private options: { active: () => boolean; hideCompletedThinking: boolean }
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
    // Pi keeps rendered text/thinking and generated errors in a child Container.
    // Final-message middleware can remove previously visible streaming content.
    if (!(component instanceof AssistantMessageComponent)) return;

    if (this.options.hideCompletedThinking && !this.assistants.has(component)) {
      this.assistants.add(component);
      const dispose = bindThinkingVisibility(component, () => {
        if (this.options.active()) this.assistantBoundary(component);
      });
      if (dispose) this.disposers.push(dispose);
    }

    const visible = component.children.some(
      (child) => child instanceof Container && child.children.length > 0
    );
    this.coordinator.setBoundary(component, visible ? this.precedingCall(component) : undefined);
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
      // Preserve identity for restoration and explicitly rebind the original receiver.
      // oxlint-disable-next-line typescript/unbound-method
      const previous = child.setExpanded;

      const setExpanded = (expanded: boolean) => {
        if (this.options.active()) coordinator.expand(call, expanded);
        // Later wrappers can retain this callback after disposal or reconstruction.
        else previous.call(child, expanded);
      };

      child.setExpanded = setExpanded;
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
        coordinator.group(call)?.expanded ?? this.host.toolOutputExpanded ?? false
      );
      this.disposers.push(() => {
        detach();
        if (child.setExpanded === setExpanded) child.setExpanded = previous;
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
