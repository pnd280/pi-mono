import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

import { resolveResultAdapter } from "../adapters/generic.ts";
import type { ToolDisplayAdapter } from "../contracts.ts";
import {
  callKey,
  isLive,
  type CallReference,
  type DisplayCall,
  type DisplayFact,
  type DisplayGroup,
  type Lifecycle,
  type Outcome,
  type SavedOutput,
  type TranscriptView
} from "../contracts.ts";
import type { OutputText } from "../output-text.ts";

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

function canExplore(call: DisplayCall): boolean {
  const adapter = resolveResultAdapter(call.adapter, call.args, call.result);

  return (adapter.exploration?.(call.args, call.result)?.length ?? 0) > 0;
}

type MutableCall = { -readonly [Key in keyof DisplayCall]: DisplayCall[Key] };

type MutableGroup = { members: MutableCall[]; expanded: boolean };

/** Ordered transcript state; renderers only read this model. No session or terminal dependency. */
export class TranscriptCoordinator implements TranscriptView {
  private state = new Map<string, MutableCall>();
  get calls(): ReadonlyMap<string, DisplayCall> {
    return this.state;
  }
  private sequence: (string | null)[] = [];
  private boundaries = new Map<object, string>();
  private groups = new Map<string, MutableGroup>();
  private boundaryCounts = new Map<string, number>();
  private latestById = new Map<string, MutableCall>();
  private liveIdentities = new Map<string, MutableCall>();
  private activeCalls = new Set<MutableCall>();
  private rows = new Map<string, Set<RowHandle>>();
  private stopAnimation: (() => void) | undefined;
  private disposed = false;
  phase = 0;
  constructor(
    readonly runtime: string,
    private options: {
      animationClock?: AnimationClock;
      /** State consequences must not depend on whether a Pi row is attached. */
      onExpansion?(call: DisplayCall): void;
    } = {}
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
    // Finalized assistant middleware can remove/reorder blocks around a streamed call.
    // Keep its runtime row identity; only historical calls use source position alone.
    const identity = JSON.stringify([reference.messageTimestamp, reference.toolCallId, name]);
    const existing =
      this.state.get(key) ?? (origin === "live" ? this.liveIdentities.get(identity) : undefined);

    if (existing) {
      const grouped = canExplore(existing);
      existing.args = args;
      existing.reference = { ...reference };
      if (grouped !== canExplore(existing)) this.regroup();
      this.changed(existing);

      return existing;
    }

    const call: MutableCall = {
      key,
      reference: { ...reference },
      name,
      args,
      adapter,
      origin,
      lifecycle: origin === "live" ? "preparing" : "unavailable",
      outcome: "unavailable",
      expanded,
      revision: 0
    };
    this.state.set(key, call);
    this.latestById.set(reference.toolCallId, call);
    if (origin === "live") this.liveIdentities.set(identity, call);
    const previous = this.sequence.at(-1);
    this.sequence.push(key);

    // Append is the common path, including history reconstruction. Only the old
    // heading and final connector can change; unrelated row caches stay valid.
    if (canExplore(call)) {
      const group =
        previous && !this.boundaryCounts.has(previous) ? this.groups.get(previous) : undefined;
      const first = group?.members[0];
      const last = group?.members.at(-1);
      const current = group ?? { members: [], expanded };
      current.members.push(call);
      call.expanded = current.expanded;
      this.groups.set(key, current);
      for (const member of new Set([first, last]))
        if (member && !member.expanded) this.invalidate(member);
    }

    if (isLive(call)) this.activeCalls.add(call);
    this.schedule();

    return call;
  }
  setAdapter(view: DisplayCall, adapter: ToolDisplayAdapter): void {
    const call = this.mutable(view);
    if (!call || call.adapter.id === adapter.id) return;
    call.adapter = adapter;
    this.regroup();
    this.changed(call);
  }
  /** Reconstruction can reveal a host-generated notice after later calls were indexed. */
  boundary(after?: DisplayCall): void {
    const position = after ? this.sequence.indexOf(after.key) + 1 : this.sequence.length;
    if (
      this.disposed ||
      (after && position === 0) ||
      this.sequence[position] === null ||
      this.sequence[position - 1] === null
    )
      return;
    this.sequence.splice(position, 0, null);
    if (after) this.regroup();
  }
  /** Visible components can withdraw their own boundary without removing other separators. */
  setBoundary(owner: object, after?: DisplayCall): void {
    const key = after?.key;
    if (this.disposed || (key && !this.calls.has(key)) || this.boundaries.get(owner) === key)
      return;
    const previous = this.boundaries.get(owner);

    if (previous) {
      const count = this.boundaryCounts.get(previous)! - 1;
      if (count) this.boundaryCounts.set(previous, count);
      else this.boundaryCounts.delete(previous);
    }

    if (key) {
      this.boundaries.set(owner, key);
      this.boundaryCounts.set(key, (this.boundaryCounts.get(key) ?? 0) + 1);
    } else this.boundaries.delete(owner);
    this.regroup();
  }
  byId(id: string): DisplayCall | undefined {
    return this.latestById.get(id);
  }
  group(call: DisplayCall): DisplayGroup | undefined {
    return this.groups.get(call.key);
  }
  update(view: DisplayCall, lifecycle: Lifecycle): void {
    const call = this.mutable(view);
    if (!call || !isLive(call)) return;
    call.lifecycle = lifecycle;
    this.changed(call);
  }
  result(
    view: DisplayCall,
    result: AgentToolResult<unknown>,
    outcome: Outcome,
    partial = false
  ): void {
    const call = this.mutable(view);
    if (!call || (partial && !isLive(call))) return;
    call.result = result;

    if (!partial) {
      call.lifecycle = "complete";
      call.outcome = outcome;
      call.liveOutput = undefined;
    }

    const grouped = canExplore(call);
    if (this.groups.has(call.key) !== grouped) this.regroup();
    this.changed(call);
  }
  fact(view: DisplayCall, fact: DisplayFact): void {
    const call = this.mutable(view);
    if (!call) return;
    if (fact.kind === "operation") call.operation = { ...fact };
    if (fact.kind === "change") call.change = { ...fact };
    if (fact.kind === "saved-output") call.savedPath = fact.path;
    this.changed(call);
  }
  preview(view: DisplayCall, output: OutputText): void {
    const call = this.mutable(view);
    if (!call || !isLive(call)) return;
    call.liveOutput = { ...output };
    this.changed(call);
  }
  setReferenceEntry(view: DisplayCall, messageEntryId: string): void {
    const call = this.mutable(view);
    if (!call || call.reference.messageEntryId === messageEntryId) return;
    call.reference = { ...call.reference, messageEntryId };
    this.changed(call);
  }
  setSavedPath(view: DisplayCall, path: string): void {
    const call = this.mutable(view);
    if (!call || call.savedPath === path) return;
    call.savedPath = path;
    this.changed(call);
  }
  setSavedOutput(view: DisplayCall, output: SavedOutput): void {
    const call = this.mutable(view);
    if (!call) return;
    call.savedOutput = { ...output };
    this.changed(call);
  }
  evictSavedOutput(path: string): void {
    if (this.disposed) return;

    for (const call of this.state.values()) {
      if (call.savedOutput?.path !== path) continue;
      delete call.savedOutput;
      this.changed(call);
    }
  }
  settle(): void {
    for (const call of this.activeCalls) {
      call.lifecycle = "unavailable";
      this.changed(call);
    }
  }
  attach(call: DisplayCall, row: RowHandle): () => void {
    if (!this.mutable(call)) return () => {};

    const rows = this.rows.get(call.key) ?? new Set();
    rows.add(row);
    this.rows.set(call.key, rows);

    return () => {
      rows.delete(row);
      if (!rows.size) this.rows.delete(call.key);
    };
  }
  expand(view: DisplayCall, expanded: boolean): void {
    const call = this.mutable(view);
    // Pi's global action visits every row; siblings already share the group's state.
    if (!call || call.expanded === expanded) return;
    const group = this.groups.get(call.key);
    if (group) group.expanded = expanded;

    for (const member of group?.members ?? [call]) {
      member.expanded = expanded;
      member.revision++;
      for (const row of this.rows.get(member.key) ?? []) row.setExpanded(expanded);
      this.options.onExpansion?.(member);
    }
  }
  private mutable(view: DisplayCall): MutableCall | undefined {
    const call = this.state.get(view.key);

    return !this.disposed && call === view ? call : undefined;
  }
  private changed(call: MutableCall): void {
    if (this.disposed) return;

    this.invalidate(call);
    const first = this.groups.get(call.key)?.members[0];
    if (first && first !== call && !first.expanded) this.invalidate(first);
    if (isLive(call)) this.activeCalls.add(call);
    else this.activeCalls.delete(call);
    this.schedule();
  }
  private invalidate(call: MutableCall): void {
    call.revision++;
    for (const row of this.rows.get(call.key) ?? []) row.invalidate();
  }
  private regroup(): void {
    const previous = this.groups;
    this.groups = new Map();
    let group: MutableGroup | undefined;

    const finish = () => {
      if (!group) return;
      const old = previous.get(group.members[0]!.key);
      // Keep stable group identity so boundaries and late contracts invalidate
      // only the groups whose membership or expansion actually changed.
      if (
        old &&
        old.expanded === group.expanded &&
        old.members.length === group.members.length &&
        old.members.every((member, index) => member === group!.members[index])
      )
        group = old;
      for (const member of group.members) this.groups.set(member.key, group);
      group = undefined;
    };

    for (const key of this.sequence) {
      const call = key ? this.state.get(key) : undefined;

      if (!call || !canExplore(call)) {
        finish();
        continue;
      }

      group ??= { members: [], expanded: call.expanded };
      group.members.push(call);
      if (this.boundaryCounts.has(call.key)) finish();
    }

    finish();

    for (const call of this.state.values()) {
      const current = this.groups.get(call.key);
      if (current === previous.get(call.key)) continue;
      const expanded = current?.expanded ?? call.expanded;

      if (call.expanded !== expanded) {
        call.expanded = expanded;
        for (const row of this.rows.get(call.key) ?? []) row.setExpanded(expanded);
        this.options.onExpansion?.(call);
      }

      this.invalidate(call);
    }
  }
  private schedule(): void {
    const active = !this.disposed && this.activeCalls.size > 0;
    if (active && !this.stopAnimation)
      this.stopAnimation = (this.options.animationClock ?? clock).start(() => {
        this.phase = 1 - this.phase;
        const affected = new Set<DisplayCall>();
        for (const call of this.activeCalls)
          affected.add(!call.expanded ? (this.groups.get(call.key)?.members[0] ?? call) : call);
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
    this.state.clear();
    this.groups.clear();
    this.boundaries.clear();
    this.boundaryCounts.clear();
    this.latestById.clear();
    this.liveIdentities.clear();
    this.activeCalls.clear();
    this.sequence = [];
  }
}
