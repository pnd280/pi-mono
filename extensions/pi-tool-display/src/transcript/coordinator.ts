import { isDeepStrictEqual } from "node:util";

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { OutputText } from "@pi-mono/utils/output-text";

import type { ToolDisplayAdapter } from "../contracts.ts";
import {
  callKey,
  isLive,
  type DisplayCall,
  type DisplayFact,
  type DisplayGroup,
  type DisplayMode,
  type DisplayRun,
  type ExplorationScope,
  type Lifecycle,
  type Outcome,
  type SavedOutput,
  type SummaryNotice,
  type SummaryRole,
  type TranscriptView
} from "../contracts.ts";
import {
  AdapterEvaluator,
  interpret,
  sameGroupKey,
  sameScope,
  type CallInterpretation,
  type DisplayFailureHandler,
  type GroupKey
} from "../interpretation.ts";
import { buildRunSummary, type RunSummary } from "../run-summary.ts";

export type RowHandle = {
  invalidate(): void;
  requestRender(): void;
  setExpanded(expanded: boolean): void;
};

export type AnimationClock = {
  start(tick: () => void): () => void;
};

const clock: AnimationClock = {
  start(tick) {
    const timer = setInterval(tick, 600);
    timer.unref();

    return () => clearInterval(timer);
  }
};

type MutableCall = { -readonly [Key in keyof DisplayCall]: DisplayCall[Key] };

/**
 * Validates a copy of Pi's raw call arguments against the currently registered tool
 * schema. Returns the raw arguments when validation fails. Never modifies them.
 */
export type ValidatedArgs = (name: string, args: unknown) => unknown;

/** A call to add, with Pi's raw arguments. Not expanded and not validated by default. */
export type CallInput = Pick<DisplayCall, "reference" | "name" | "args" | "adapter" | "origin"> &
  Partial<Pick<DisplayCall, "expanded">> & { validated?: ValidatedArgs };

/** A partial result keeps the call live and ignores the outcome and duration. */
export type ResultStatus = { outcome: Outcome; partial?: boolean; durationMs?: number | undefined };

/** Without a tool registry, callbacks receive Pi's raw arguments. */
const withoutRegistry: ValidatedArgs = (_name, args) => args;

type MutableGroup = {
  members: MutableCall[];
  expanded: boolean;
  scope: ExplorationScope;
  title: string | undefined;
};

type Boundary = {
  key: string;
  /** Both separate groups; only run boundaries partition and end runs. */
  kind: "group" | "run";
};

type MutableRun = {
  members: MutableCall[];
  liveMembers: number;
  summary?: RunSummary;
  opened: boolean;
  /** The agent ended after this run's last member. */
  closed: boolean;
  /** Cached: no member is live and nothing more can join the run. */
  ended: boolean;
};

/** Ordered transcript state; renderers only read this model. No session or terminal dependency. */
export class TranscriptCoordinator implements TranscriptView {
  private state = new Map<string, MutableCall>();
  get calls(): ReadonlyMap<string, DisplayCall> {
    return this.state;
  }
  private sequence: string[] = [];
  private positions = new Map<string, number>();
  private explorable = new Map<string, GroupKey>();
  private cwd: string;
  private separators = new Set<string>();
  private groupingDepth = 0;
  private invalidationDepth = 0;
  private pendingInvalidations = new Set<MutableCall>();
  private regroupPending = false;
  private boundaries = new Map<object, Boundary>();
  private groups = new Map<string, MutableGroup>();
  private runs = new Map<string, MutableRun>();
  private notices = new Map<string, SummaryNotice[]>();
  private boundaryCounts = new Map<string, { group: number; run: number }>();
  private latestById = new Map<string, MutableCall>();
  private liveIdentities = new Map<string, MutableCall>();
  private activeCalls = new Set<MutableCall>();
  private rows = new Map<string, Set<RowHandle>>();
  /** Pi's raw arguments for each call; `args` holds their validated copy, if any. */
  private rawArgs = new WeakMap<DisplayCall, unknown>();
  private interpretations = new WeakMap<
    DisplayCall,
    { inputs: readonly unknown[]; value: CallInterpretation }
  >();
  private evaluators = new WeakMap<DisplayCall, AdapterEvaluator>();
  private stopAnimation: (() => void) | undefined;
  private disposed = false;
  phase = 0;
  mode: DisplayMode;
  /** Whether summary mode collapses runs; otherwise it renders like compact. */
  summaries: boolean;
  constructor(
    readonly runtime: string,
    private options: {
      cwd?: string;
      /** Defaults to compact; the host selects the configured startup mode. */
      mode?: DisplayMode;
      /** Defaults to true; the host enables summaries only in fullscreen. */
      summaries?: boolean;
      animationClock?: AnimationClock;
      /**
       * The call's saved path, expansion, or completion changed. State consequences
       * must not depend on whether a Pi row is attached.
       */
      onSavedOutputChange?(call: DisplayCall): void;
      onFailure?: DisplayFailureHandler;
    } = {}
  ) {
    this.cwd = options.cwd ?? process.cwd();
    this.mode = options.mode ?? "compact";
    this.summaries = options.summaries ?? true;
  }
  add({
    reference,
    name,
    args,
    adapter,
    origin,
    expanded = false,
    validated = withoutRegistry
  }: CallInput): DisplayCall {
    const key = callKey(this.runtime, reference);
    // Finalized assistant middleware can remove/reorder blocks around a streamed call.
    // Keep its runtime row identity; only historical calls use source position alone.
    const identity = JSON.stringify([reference.messageTimestamp, reference.toolCallId, name]);
    const existing =
      this.state.get(key) ?? (origin === "live" ? this.liveIdentities.get(identity) : undefined);

    if (existing) {
      // Final middleware can also replace the tool at the same position. Pi executes
      // the final tool, so its name and display adapter replace the streamed ones.
      const renamed = existing.name !== name;

      if (renamed) {
        const previous = JSON.stringify([
          existing.reference.messageTimestamp,
          existing.reference.toolCallId,
          existing.name
        ]);

        if (this.liveIdentities.get(previous) === existing) {
          this.liveIdentities.delete(previous);
          this.liveIdentities.set(identity, existing);
        }

        existing.name = name;
        existing.adapter = adapter;
      }

      const referenceChanged =
        existing.reference.messageTimestamp !== reference.messageTimestamp ||
        existing.reference.contentIndex !== reference.contentIndex ||
        existing.reference.toolCallId !== reference.toolCallId ||
        existing.reference.messageEntryId !== reference.messageEntryId;
      if (referenceChanged) existing.reference = { ...reference };
      this.rawArgs.set(existing, args);
      if (this.validate(existing, validated) || renamed) this.changed(existing);

      return existing;
    }

    const call: MutableCall = {
      key,
      reference: { ...reference },
      name,
      args: validated(name, args),
      adapter,
      origin,
      lifecycle: origin === "live" ? "preparing" : "unavailable",
      outcome: "unavailable",
      expanded,
      revision: 0
    };
    this.rawArgs.set(call, args);
    this.state.set(key, call);
    this.latestById.set(reference.toolCallId, call);
    if (origin === "live") this.liveIdentities.set(identity, call);
    const previous = this.sequence.at(-1);
    this.positions.set(key, this.sequence.length);
    this.sequence.push(key);

    // Append is the common path, including history reconstruction. Only the old
    // heading and final connector can change; unrelated row caches stay valid.
    const grouping = this.interpretation(call).group;

    if (grouping) {
      this.explorable.set(key, grouping);
      this.appendGroup(call, previous, grouping);
    }

    if (isLive(call)) this.activeCalls.add(call);
    this.appendRun(call, previous);
    this.schedule();

    return call;
  }
  /** A newer tool registry can select another adapter and validate arguments differently. */
  refreshTools(view: DisplayCall, adapter: ToolDisplayAdapter, validated: ValidatedArgs): void {
    const call = this.mutable(view);
    if (!call) return;
    const adapterChanged = call.adapter.id !== adapter.id;
    if (adapterChanged) call.adapter = adapter;
    if (this.validate(call, validated) || adapterChanged) this.changed(call);
  }
  /**
   * Validate the raw arguments again and report whether the call's arguments changed.
   * Middleware can modify Pi's argument object in place, so this compares values, not
   * identities. Equal values keep the arguments and their cached interpretation.
   */
  private validate(call: MutableCall, validated: ValidatedArgs): boolean {
    const args = validated(call.name, this.rawArgs.get(call));
    if (isDeepStrictEqual(call.args, args)) return false;
    call.args = args;

    return true;
  }
  /** Reconcile groups and invalidate each affected row once after synchronous updates.
   * Intermediate group views are not ready for rendering or expansion.
   */
  batch<T>(update: () => T): T {
    this.groupingDepth++;
    this.invalidationDepth++;

    try {
      return update();
    } finally {
      this.groupingDepth--;

      try {
        if (!this.groupingDepth && this.regroupPending)
          this.regroup([[0, this.sequence.length - 1]]);
      } finally {
        this.invalidationDepth--;
        if (!this.invalidationDepth) this.flushInvalidations();
      }
    }
  }
  /** Reconstruction can reveal a host-generated notice after later calls were indexed. */
  boundary(after?: DisplayCall): void {
    const key = after?.key ?? this.sequence.at(-1);
    if (this.disposed || !key || !this.state.has(key) || this.separators.has(key)) return;
    const separated = this.separated(key);
    const runSeparated = this.separated(key, "run");
    this.separators.add(key);

    if (after && !separated) this.regroupBoundaries([key]);
    if (after && !runSeparated) this.repartitionRuns([key]);

    const run = this.runs.get(key);
    if (run) this.refreshEnded(run);
  }
  /** Thinking can separate visible groups without partitioning or ending a run.
   * Each component can change or withdraw only its own boundary.
   */
  setBoundary(owner: object, after?: DisplayCall, kind: Boundary["kind"] = "run"): void {
    const key = after?.key;
    const previous = this.boundaries.get(owner);
    if (
      this.disposed ||
      (key && !this.calls.has(key)) ||
      (previous?.key === key && (!key || previous?.kind === kind))
    )
      return;
    const affected = new Map(
      [previous?.key, key]
        .filter((key) => key !== undefined)
        .map((key) => [key, { group: this.separated(key), run: this.separated(key, "run") }])
    );

    const count = (boundary: Boundary, delta: number) => {
      const counts = this.boundaryCounts.get(boundary.key) ?? { group: 0, run: 0 };
      counts.group += delta;
      if (boundary.kind === "run") counts.run += delta;
      if (counts.group) this.boundaryCounts.set(boundary.key, counts);
      else this.boundaryCounts.delete(boundary.key);
    };

    if (previous) count(previous, -1);

    if (key) {
      const boundary = { key, kind };
      this.boundaries.set(owner, boundary);
      count(boundary, 1);
    } else this.boundaries.delete(owner);
    const changed = (kind: Boundary["kind"]) =>
      [...affected]
        .filter(([key, before]) => before[kind] !== this.separated(key, kind))
        .map(([key]) => key);
    this.regroupBoundaries(changed("group"));
    this.repartitionRuns(changed("run"));
  }
  /** Cached until an interpreted input changes; identities use the session cwd. */
  interpretation(call: DisplayCall): CallInterpretation {
    const inputs = [
      call.name,
      call.adapter,
      call.args,
      call.result,
      call.lifecycle,
      call.outcome,
      call.cancellation,
      call.operation,
      call.change
    ];
    const cached = this.interpretations.get(call);
    if (cached?.inputs.every((input, index) => Object.is(input, inputs[index])))
      return cached.value;
    const run = this.runs.get(call.key);
    if (run) delete run.summary;
    const value = interpret(call, this.cwd, this.evaluator(call));
    this.interpretations.set(call, { inputs, value });

    return value;
  }
  evaluator(view: DisplayCall): AdapterEvaluator {
    let evaluator = this.evaluators.get(view);

    if (!evaluator) {
      // A card failure changes every display consumer, not just one renderer slot.
      evaluator = new AdapterEvaluator(
        () => view.adapter,
        this.options.onFailure,
        () => {
          this.interpretations.delete(view);
          const call = this.mutable(view);
          if (call) this.changed(call);
        }
      );
      this.evaluators.set(view, evaluator);
    }

    return evaluator;
  }
  byId(id: string): DisplayCall | undefined {
    return this.latestById.get(id);
  }
  group(call: DisplayCall): DisplayGroup | undefined {
    const group = this.groups.get(call.key);

    return group && group.members.length > 1 ? group : undefined;
  }
  run(call: DisplayCall): DisplayRun | undefined {
    return this.runs.get(call.key);
  }
  /** Notices stay attached to their preceding call when run boundaries change. */
  addSummaryNotice(after: DisplayCall, notice: SummaryNotice): void {
    const call = this.mutable(after);
    if (!call) return;
    const notices = this.notices.get(call.key) ?? [];
    notices.push(notice);
    this.notices.set(call.key, notices);
    const run = this.runs.get(call.key);
    if (run) delete run.summary;
    // Refresh the cached line and any newly available collapse controls.
    for (const member of run?.members ?? [call]) this.invalidate(member);
  }
  summary(call: DisplayCall): RunSummary {
    const run = this.runs.get(call.key);
    if (run?.summary) return run.summary;
    const summary = buildRunSummary(
      run?.members ?? [call],
      (member) => this.interpretation(member),
      (member) => this.notices.get(member.key) ?? []
    );
    if (run) run.summary = summary;

    return summary;
  }
  /** Only ended runs collapse; live runs render compact cards. */
  summaryRole(call: DisplayCall): SummaryRole | undefined {
    const run = this.runs.get(call.key);
    if (!run || !this.summarized(run)) return undefined;

    return { kind: run.members[0] === call ? "leader" : "hidden" };
  }
  /** Mode changes reset opened runs and re-render every row once. */
  setMode(mode: DisplayMode): void {
    if (this.disposed || this.mode === mode) return;
    this.mode = mode;
    this.rerender();
  }
  setSummaries(enabled: boolean): void {
    if (this.disposed || this.summaries === enabled) return;
    this.summaries = enabled;
    if (this.mode === "summary") this.rerender();
  }
  /** Close opened runs and re-render every row once. */
  private rerender(): void {
    for (const run of new Set(this.runs.values())) run.opened = false;
    this.invalidationDepth++;

    try {
      for (const call of this.state.values()) this.invalidate(call);
    } finally {
      this.invalidationDepth--;
      if (!this.invalidationDepth) this.flushInvalidations();
    }
  }
  /**
   * Apply a click on a call's row. A collapse control closes its run. A card click
   * opens its run: a summarized run is handled; otherwise a grouped card toggles
   * its group. Notice clicks keep the run open without toggling the anchor's group.
   * Returns false when the host should handle the click itself.
   */
  activate(view: DisplayCall, target: "card" | "notice" | "collapse"): boolean {
    const call = this.mutable(view);
    const run = call && this.runs.get(call.key);
    if (!call || !run) return false;

    if (target === "collapse") {
      this.closeRun(run);

      return true;
    }

    const summarized = this.summarized(run);
    this.openRun(run);
    if (summarized) return true;
    if (target === "notice" || !this.group(call)) return false;
    this.expand(call, !call.expanded);

    return true;
  }
  /**
   * Keep a run's compact cards until the next mode change. Opens a summarized run;
   * a run the user interacted with before it ended stays open when it ends.
   */
  private openRun(run: MutableRun): void {
    if (run.opened || this.mode !== "summary" || !this.summaries) return;
    const summarized = this.summarized(run);
    run.opened = true;
    if (summarized) for (const member of run.members) this.invalidate(member);
  }
  /** An opened run with a summary to return to, from either end of its cards. */
  collapsible(call: DisplayCall): boolean {
    const run = this.runs.get(call.key);

    return this.closable(run);
  }
  private closable(run: MutableRun | undefined): boolean {
    const first = run?.members[0];

    return (
      !!run &&
      !!first &&
      run.opened &&
      run.ended &&
      this.mode === "summary" &&
      this.summaries &&
      this.summary(first).segments.length > 0
    );
  }
  /** Return an opened run to its summary line. */
  private closeRun(run: MutableRun): void {
    if (!this.closable(run)) return;
    run.opened = false;
    for (const member of run.members) this.invalidate(member);
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
    { outcome, partial = false, durationMs }: ResultStatus
  ): void {
    const call = this.mutable(view);
    if (!call || (partial && !isLive(call))) return;
    call.result = result;
    // Results are borrowed: a producer can update and republish the same object.
    this.interpretations.delete(call);

    const completed = !partial && call.lifecycle !== "complete";

    if (!partial) {
      call.lifecycle = "complete";
      call.outcome = outcome;
      call.liveOutput = undefined;
      if (durationMs === undefined) delete call.durationMs;
      else call.durationMs = durationMs;
    }

    this.changed(call);
    if (completed) this.options.onSavedOutputChange?.(call);
  }
  fact(view: DisplayCall, fact: DisplayFact): void {
    if (fact.kind === "saved-output") return this.setSavedPath(view, fact.path);
    const call = this.mutable(view);
    if (!call) return;
    if (fact.kind === "operation") call.operation = { ...fact };
    if (fact.kind === "cancellation") call.cancellation = { ...fact };
    if (fact.kind === "change") call.change = { ...fact };
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
    delete call.savedOutput;
    this.changed(call);
    this.options.onSavedOutputChange?.(call);
  }
  setSavedOutput(view: DisplayCall, output: SavedOutput | undefined): void {
    const call = this.mutable(view);
    if (!call || call.savedOutput === output) return;
    if (output) call.savedOutput = { ...output };
    else delete call.savedOutput;
    this.changed(call);
  }
  /** The agent ended: unfinished calls become unavailable and the final run ends. */
  settle(): void {
    const last = this.sequence.at(-1);
    const run = last === undefined ? undefined : this.runs.get(last);
    if (run) run.closed = true;

    for (const call of this.activeCalls) {
      call.lifecycle = "unavailable";
      this.changed(call);
    }

    if (run) this.refreshEnded(run);
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
      this.options.onSavedOutputChange?.(member);
    }
  }
  private mutable(view: DisplayCall): MutableCall | undefined {
    const call = this.state.get(view.key);

    return !this.disposed && call === view ? call : undefined;
  }
  private changed(call: MutableCall): void {
    if (this.disposed) return;
    // Ending a run can invalidate the changed call again; render it once.
    this.invalidationDepth++;

    try {
      this.refreshGrouping(call);
      this.invalidate(call);
      const first = this.groups.get(call.key)?.members[0];
      if (first && first !== call && !first.expanded) this.invalidate(first);
      const live = isLive(call);
      const delta = Number(live) - Number(this.activeCalls.has(call));
      if (live) this.activeCalls.add(call);
      else this.activeCalls.delete(call);
      const run = this.runs.get(call.key);

      if (run) {
        run.liveMembers += delta;
        this.refreshEnded(run);
        this.invalidateLeader(run, call);
      }
    } finally {
      this.invalidationDepth--;
      if (!this.invalidationDepth) this.flushInvalidations();
    }

    this.schedule();
  }
  private summarized(run: MutableRun): boolean {
    return this.mode === "summary" && this.summaries && run.ended && !run.opened;
  }
  /** A member change alters its run's summary line, rendered by the leader. */
  private invalidateLeader(run: MutableRun | undefined, except?: MutableCall): void {
    const leader = run?.members[0];
    if (run && leader && leader !== except && this.summarized(run)) this.invalidate(leader);
  }
  private newRun(): MutableRun {
    return { members: [], liveMembers: 0, opened: false, closed: false, ended: false };
  }
  private appendRun(call: MutableCall, previous: string | undefined): void {
    const before = previous === undefined ? undefined : this.runs.get(previous);
    const run =
      before && previous !== undefined && !this.separated(previous, "run") ? before : undefined;
    const current = run ?? this.newRun();
    current.members.push(call);
    current.liveMembers += Number(this.activeCalls.has(call));
    delete current.summary;
    current.closed = false;
    this.runs.set(call.key, current);
    this.refreshEnded(current);
    this.invalidateLeader(current, call);
  }
  /**
   * A run ends once no member is live and nothing more can join it: a run boundary
   * follows it, the agent ended, or it is history. Thinking is only a group boundary.
   */
  private refreshEnded(run: MutableRun): void {
    const last = run.members.at(-1);
    const ended =
      !!last &&
      run.liveMembers === 0 &&
      (run.closed || this.separated(last.key, "run") || last.origin === "historical");
    if (ended === run.ended) return;
    const summarized = this.summarized(run);
    run.ended = ended;

    if (summarized !== this.summarized(run))
      for (const member of run.members) this.invalidate(member);
    // Both ends of an opened run gain or lose collapse controls.
    else if (run.opened) {
      const first = run.members[0];
      if (first) this.invalidate(first);
      if (last && last !== first) this.invalidate(last);
    }
  }
  /** Rebuild runs around changed run boundaries, never thinking visibility changes. */
  private repartitionRuns(keys: readonly string[]): void {
    if (this.disposed) return;
    const ranges: [number, number][] = [];

    for (const key of keys) {
      const run = this.runs.get(key);
      const next = this.sequence[this.position(key) + 1];
      const following = next === undefined ? undefined : this.runs.get(next);
      const first = run?.members[0];
      const last = following?.members.at(-1) ?? run?.members.at(-1);
      if (!first || !last) continue;
      ranges.push([this.position(first.key), this.position(last.key)]);
    }

    ranges.sort((left, right) => left[0] - right[0]);
    const merged: [number, number][] = [];

    for (const range of ranges) {
      const current = merged.at(-1);
      if (current && range[0] <= current[1] + 1) current[1] = Math.max(current[1], range[1]);
      else merged.push([...range]);
    }

    for (const [start, end] of merged) this.rebuildRuns(start, end);
  }
  private rebuildRuns(start: number, end: number): void {
    const calls = this.sequence.slice(start, end + 1).map((key) => {
      const call = this.state.get(key);
      if (!call) throw new Error("Transcript call state is unavailable.");

      return call;
    });
    const previous = new Map(calls.map((call) => [call.key, this.runs.get(call.key)]));
    const partition: MutableCall[][] = [];
    let members: MutableCall[] = [];

    for (const call of calls) {
      members.push(call);

      if (this.separated(call.key, "run")) {
        partition.push(members);
        members = [];
      }
    }

    if (members.length) partition.push(members);

    for (const members of partition) {
      const first = members[0];
      const old = first ? previous.get(first.key) : undefined;
      const run =
        old?.members.length === members.length &&
        old.members.every((member, index) => member === members[index])
          ? old
          : this.newRun();

      if (run !== old) {
        run.members = members;
        run.liveMembers = members.reduce(
          (count, member) => count + Number(this.activeCalls.has(member)),
          0
        );
        run.opened = members.some((member) => previous.get(member.key)?.opened);
        const last = members.at(-1);
        run.closed = !!(last && previous.get(last.key)?.closed);
      }

      for (const member of members) this.runs.set(member.key, run);
      this.refreshEnded(run);
    }

    if (this.mode !== "summary" || !this.summaries) return;
    for (const call of calls)
      if (this.runs.get(call.key) !== previous.get(call.key)) this.invalidate(call);
  }
  private invalidate(call: MutableCall): void {
    if (this.invalidationDepth) {
      this.pendingInvalidations.add(call);

      return;
    }

    call.revision++;
    for (const row of this.rows.get(call.key) ?? []) row.invalidate();
  }
  private flushInvalidations(): void {
    if (this.disposed) {
      this.pendingInvalidations.clear();

      return;
    }

    const pending = [...this.pendingInvalidations];
    this.pendingInvalidations.clear();

    for (const call of pending) this.invalidate(call);
  }
  private separated(key: string, kind: Boundary["kind"] = "group"): boolean {
    return this.separators.has(key) || (this.boundaryCounts.get(key)?.[kind] ?? 0) > 0;
  }
  private position(key: string): number {
    const position = this.positions.get(key);
    if (position === undefined) throw new Error("Transcript call position is unavailable.");

    return position;
  }
  private groupRange(key: string): [number, number] {
    const members = this.groups.get(key)?.members;

    return [this.position(members?.[0]?.key ?? key), this.position(members?.at(-1)?.key ?? key)];
  }
  private newGroup(call: MutableCall, grouping: GroupKey): MutableGroup {
    return {
      members: [],
      expanded: call.expanded,
      scope: grouping.scope,
      title: grouping.title
    };
  }
  private sharesGroup(left: string, right: string): boolean {
    const first = this.explorable.get(left);
    const second = this.explorable.get(right);

    return !!first && !!second && sameGroupKey(first, second);
  }
  private appendGroup(call: MutableCall, previous: string | undefined, grouping: GroupKey): void {
    const group =
      previous && !this.separated(previous) && this.sharesGroup(previous, call.key)
        ? this.groups.get(previous)
        : undefined;
    const first = group?.members[0];
    const last = group?.members.at(-1);
    const current = group ?? this.newGroup(call, grouping);
    current.members.push(call);
    this.groups.set(call.key, current);
    this.synchronizeExpansion(call, current.expanded);
    for (const member of new Set([first, last]))
      if (member && !member.expanded) this.invalidate(member);
  }
  private synchronizeExpansion(call: MutableCall, expanded: boolean): void {
    if (call.expanded === expanded) return;
    call.expanded = expanded;
    for (const row of this.rows.get(call.key) ?? []) row.setExpanded(expanded);
    this.options.onSavedOutputChange?.(call);
  }
  private refreshGrouping(call: MutableCall): void {
    const grouping = this.interpretation(call).group;
    const previousGrouping = this.explorable.get(call.key);
    if (sameGroupKey(grouping, previousGrouping)) return;
    if (grouping) this.explorable.set(call.key, grouping);
    else this.explorable.delete(call.key);
    const position = this.position(call.key);
    const previous = this.sequence[position - 1];
    const next = this.sequence[position + 1];

    // Argument streaming commonly makes the last row explorable after creation.
    // Extend its predecessor exactly like an append, without rebuilding interiors.
    if (grouping && !previousGrouping && !next && !this.groupingDepth) {
      this.appendGroup(call, previous, grouping);

      return;
    }

    let [start, end] = this.groupRange(call.key);

    if (grouping) {
      if (previous && this.sharesGroup(previous, call.key) && !this.separated(previous))
        start = Math.min(start, this.groupRange(previous)[0]);
      if (next && this.sharesGroup(call.key, next) && !this.separated(call.key))
        end = Math.max(end, this.groupRange(next)[1]);
    }

    this.regroup([[start, end]]);
  }
  private regroupBoundaries(keys: readonly string[]): void {
    const ranges: [number, number][] = [];

    for (const key of keys) {
      const next = this.sequence[this.position(key) + 1];
      if (!next || !this.explorable.has(key) || !this.explorable.has(next)) continue;
      ranges.push([this.groupRange(key)[0], this.groupRange(next)[1]]);
    }

    this.regroup(ranges);
  }
  private regroup(ranges: [number, number][]): void {
    if (this.disposed || !ranges.length) return;

    if (this.groupingDepth) {
      this.regroupPending = true;

      return;
    }

    this.regroupPending = false;
    // Moving a boundary can affect overlapping groups. Reconcile their final
    // partition together so expansion never propagates through a temporary merge.
    ranges.sort((left, right) => left[0] - right[0]);
    let current = ranges[0];
    if (!current) return;

    for (const range of ranges.slice(1)) {
      if (range[0] <= current[1] + 1) current[1] = Math.max(current[1], range[1]);
      else {
        this.rebuildGroups(...current);
        current = range;
      }
    }

    this.rebuildGroups(...current);
  }
  private rebuildGroups(start: number, end: number): void {
    const previous = new Map<string, MutableGroup>();
    const calls = this.sequence.slice(start, end + 1).map((key) => {
      const call = this.state.get(key);
      if (!call) throw new Error("Transcript call state is unavailable.");

      return call;
    });

    for (const { key } of calls) {
      const group = this.groups.get(key);
      if (group) previous.set(key, group);
      this.groups.delete(key);
    }

    let group: MutableGroup | undefined;

    const finish = () => {
      if (!group) return;
      const members = group.members;
      const first = members[0];
      const old = first ? previous.get(first.key) : undefined;
      // Keep stable group identity so boundaries and late contracts invalidate
      // only the groups whose membership or expansion actually changed.
      if (
        old &&
        old.expanded === group.expanded &&
        sameScope(old.scope, group.scope) &&
        old.title === group.title &&
        old.members.length === group.members.length &&
        old.members.every((member, index) => member === members[index])
      )
        group = old;
      for (const member of group.members) this.groups.set(member.key, group);
      group = undefined;
    };

    for (const call of calls) {
      const grouping = this.explorable.get(call.key);

      if (!grouping) {
        finish();
        continue;
      }

      if (group && !sameGroupKey({ scope: group.scope, title: group.title }, grouping)) finish();
      group ??= this.newGroup(call, grouping);
      group.members.push(call);
      if (this.separated(call.key)) finish();
    }

    finish();

    for (const call of calls) {
      const current = this.groups.get(call.key);
      if (current === previous.get(call.key)) continue;
      const expanded = current?.expanded ?? call.expanded;

      this.synchronizeExpansion(call, expanded);
      this.invalidate(call);
    }
  }
  private schedule(): void {
    const active = !this.disposed && this.activeCalls.size > 0;
    if (active && !this.stopAnimation)
      this.stopAnimation = (this.options.animationClock ?? clock).start(() => {
        this.phase = 1 - this.phase;
        const affected = new Set<DisplayCall>();

        for (const call of this.activeCalls) {
          // Collapsed groups animate their heading; live calls never belong to a summary.
          const first = !call.expanded ? this.groups.get(call.key)?.members[0] : undefined;

          affected.add(first ?? call);
        }

        // A phase change only affects heading markers. Invalidating Pi's row also
        // rebuilds both renderer slots and discards unchanged body preparation.
        for (const call of affected)
          for (const row of this.rows.get(call.key) ?? []) row.requestRender();
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
    this.runs.clear();
    this.notices.clear();
    this.separators.clear();
    this.regroupPending = false;
    this.pendingInvalidations.clear();
    this.boundaries.clear();
    this.boundaryCounts.clear();
    this.latestById.clear();
    this.liveIdentities.clear();
    this.activeCalls.clear();
    this.positions.clear();
    this.explorable.clear();
    this.sequence = [];
  }
}
