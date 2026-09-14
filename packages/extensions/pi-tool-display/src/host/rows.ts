import { AssistantMessageComponent, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Container, type Component } from "@earendil-works/pi-tui";

import type { DisplayCall, TranscriptView } from "../contracts.ts";
import type { DisplaySession } from "../transcript/session.ts";
import { record } from "../values.ts";
import type { Host } from "./compatibility.ts";

/** Pi 0.85.1 prepends a margin row and subtracts it in handleMouse. Join compact
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
  private decorated = new Set<string>();
  private calls = new WeakMap<object, DisplayCall>();
  constructor(
    private host: Host,
    private display: DisplaySession,
    private active: () => boolean
  ) {}
  claimCall(name: string): DisplayCall | undefined {
    const call = [...this.display.coordinator.calls.values()].find(
      (candidate) => candidate.name === name && !this.decorated.has(candidate.key)
    );
    if (call) this.decorated.add(call.key);

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
  private precedingCall(component: Component): DisplayCall | undefined {
    if (!this.active()) return;
    const children = this.host.chatContainer?.children ?? [];

    for (let index = children.indexOf(component) - 1; index >= 0; index--) {
      const child = children[index];
      if (!(child instanceof ToolExecutionComponent)) continue;
      const call = this.rowCall(child);
      if (call) return call;
    }
  }
  boundaryBefore(component: Component): void {
    const call = this.precedingCall(component);
    if (call) this.display.coordinator.boundary(call);
  }
  assistantBoundary(component: Component | undefined): void {
    // Pi keeps rendered text/thinking and generated errors in a child Container.
    // Final-message middleware can remove previously visible streaming content.
    if (!(component instanceof AssistantMessageComponent)) return;
    const visible = component.children.some(
      (child) => child instanceof Container && child.children.length > 0
    );
    this.display.coordinator.setBoundary(
      component,
      visible ? this.precedingCall(component) : undefined
    );
  }
  bind(): void {
    // A host event may reconstruct the transcript before its original handler returns.
    if (!this.active()) return;
    const coordinator = this.display.coordinator;

    for (const child of this.host.chatContainer?.children ?? []) {
      if (!(child instanceof ToolExecutionComponent) || this.bound.has(child)) continue;
      const call = this.rowCall(child);
      if (!call) continue;
      this.bound.add(child);
      this.disposers.push(joinGroupedRow(child, call, coordinator, this.active));
      // Preserve identity for restoration and explicitly rebind the original receiver.
      // oxlint-disable-next-line typescript/unbound-method
      const previous = child.setExpanded;

      const setExpanded = (expanded: boolean) => {
        if (this.active()) coordinator.expand(call, expanded);
        // Later wrappers can retain this callback after disposal or reconstruction.
        else previous.call(child, expanded);
      };

      child.setExpanded = setExpanded;
      const detach = coordinator.attach(call, {
        invalidate: () => {
          child.invalidate();
          this.host.ui?.requestRender();
        },
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
    this.decorated.clear();
  }
}
