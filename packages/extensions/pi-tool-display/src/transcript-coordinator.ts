import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import type { ToolDisplayAdapter } from "./adapters.ts";
import {
  callKey,
  isLive,
  type CallReference,
  type DisplayCall,
  type DisplayFact,
  type DisplayGroup,
  type Lifecycle,
  type Outcome
} from "./display-model.ts";
import type { OutputText } from "./output-text.ts";

export interface RowHandle {
  invalidate(): void;
  setExpanded(expanded: boolean): void;
}
export interface AnimationClock {
  start(tick: () => void): () => void;
}
const clock: AnimationClock = {
  start(tick) {
    const timer = setInterval(tick, 600);
    timer.unref();
    return () => clearInterval(timer);
  }
};
/** Ordered transcript state; renderers only read this model. No session or terminal dependency. */
export class TranscriptCoordinator {
  readonly calls = new Map<string, DisplayCall>();
  private sequence: (string | null)[] = [];
  private groups = new Map<string, DisplayGroup>();
  private rows = new Map<string, Set<RowHandle>>();
  private stopAnimation: (() => void) | undefined;
  private disposed = false;
  phase = 0;
  constructor(
    readonly runtime: string,
    private animationClock: AnimationClock = clock
  ) {}
  add(
    reference: CallReference,
    name: string,
    args: unknown,
    adapter: ToolDisplayAdapter,
    origin: DisplayCall["origin"],
    expanded = false
  ): DisplayCall {
    const key = callKey(this.runtime, reference);
    const existing = this.calls.get(key);
    if (existing) {
      const grouped =
        (existing.adapter.exploration?.(existing.args, existing.result)?.length ?? 0) > 0;
      existing.args = args;
      existing.reference = reference;
      if (grouped !== (existing.adapter.exploration?.(args, existing.result)?.length ?? 0) > 0)
        this.regroup();
      this.changed(existing);
      return existing;
    }
    const call: DisplayCall = {
      key,
      reference,
      name,
      args,
      adapter,
      origin,
      lifecycle: origin === "live" ? "preparing" : "unavailable",
      outcome: "unavailable",
      expanded,
      revision: 0
    };
    this.calls.set(key, call);
    this.sequence.push(key);
    this.regroup();
    this.schedule();
    return call;
  }
  setAdapter(call: DisplayCall, adapter: ToolDisplayAdapter): void {
    if (this.disposed || call.adapter.id === adapter.id) return;
    call.adapter = adapter;
    this.regroup();
    this.changed(call);
  }
  boundary(): void {
    if (this.sequence.at(-1) !== null) this.sequence.push(null);
  }
  byId(id: string): DisplayCall | undefined {
    return [...this.calls.values()].reverse().find((call) => call.reference.toolCallId === id);
  }
  group(call: DisplayCall): DisplayGroup | undefined {
    return this.groups.get(call.key);
  }
  update(call: DisplayCall, lifecycle: Lifecycle): void {
    if (!isLive(call)) return;
    call.lifecycle = lifecycle;
    this.changed(call);
  }
  result(
    call: DisplayCall,
    result: AgentToolResult<unknown>,
    outcome: Outcome,
    partial = false
  ): void {
    if (partial && !isLive(call)) return;
    call.result = result;
    if (!partial) {
      call.lifecycle = "complete";
      call.outcome = outcome;
      call.liveOutput = undefined;
    }
    const grouped = (call.adapter.exploration?.(call.args, result)?.length ?? 0) > 0;
    if (this.groups.has(call.key) !== grouped) this.regroup();
    this.changed(call);
  }
  fact(call: DisplayCall, fact: DisplayFact): void {
    if (this.disposed) return;
    if (fact.kind === "operation") call.operation = fact;
    if (fact.kind === "change") call.change = fact;
    if (fact.kind === "saved-output") call.savedPath = fact.path;
    this.changed(call);
  }
  preview(call: DisplayCall, output: OutputText): void {
    if (!isLive(call)) return;
    call.liveOutput = output;
    this.changed(call);
  }
  settle(): void {
    for (const call of this.calls.values())
      if (isLive(call)) {
        call.lifecycle = "unavailable";
        this.changed(call);
      }
  }
  attach(call: DisplayCall, row: RowHandle): () => void {
    const rows = this.rows.get(call.key) ?? new Set();
    rows.add(row);
    this.rows.set(call.key, rows);
    return () => {
      rows.delete(row);
      if (!rows.size) this.rows.delete(call.key);
    };
  }
  expand(call: DisplayCall, expanded: boolean): void {
    // Pi's global action visits every row; siblings already share the group's state.
    if (this.disposed || call.expanded === expanded) return;
    const group = this.groups.get(call.key);
    if (group) group.expanded = expanded;
    for (const member of group?.members ?? [call]) {
      member.expanded = expanded;
      member.revision++;
      for (const row of this.rows.get(member.key) ?? []) row.setExpanded(expanded);
    }
  }
  changed(call: DisplayCall): void {
    if (this.disposed) return;
    for (const member of this.groups.get(call.key)?.members ?? [call]) {
      member.revision++;
      for (const row of this.rows.get(member.key) ?? []) row.invalidate();
    }
    this.schedule();
  }
  private regroup(): void {
    this.groups.clear();
    let group: DisplayGroup | undefined;
    for (const key of this.sequence) {
      const call = key ? this.calls.get(key) : undefined;
      if (!call || (call.adapter.exploration?.(call.args, call.result)?.length ?? 0) === 0) {
        group = undefined;
        continue;
      }
      group ??= { members: [], expanded: call.expanded };
      group.members.push(call);
      call.expanded = group.expanded;
      this.groups.set(call.key, group);
    }
    for (const call of this.calls.values()) {
      call.revision++;
      for (const row of this.rows.get(call.key) ?? []) {
        row.setExpanded(call.expanded);
        row.invalidate();
      }
    }
  }
  private schedule(): void {
    const active = !this.disposed && [...this.calls.values()].some(isLive);
    if (active && !this.stopAnimation)
      this.stopAnimation = this.animationClock.start(() => {
        this.phase = 1 - this.phase;
        const affected = new Set<DisplayCall>();
        for (const call of this.calls.values())
          if (isLive(call))
            for (const member of this.groups.get(call.key)?.members ?? [call]) affected.add(member);
        for (const call of affected)
          for (const row of this.rows.get(call.key) ?? []) row.invalidate();
      });
    if (!active) {
      this.stopAnimation?.();
      this.stopAnimation = undefined;
    }
  }
  dispose(): void {
    this.disposed = true;
    this.stopAnimation?.();
    this.stopAnimation = undefined;
    this.rows.clear();
    this.calls.clear();
    this.groups.clear();
    this.sequence = [];
  }
}
