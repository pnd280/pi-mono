import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type {
  BorrowedToolResult,
  CallReference,
  DisplayCall,
  DisplayFact,
  DisplayMode,
  Outcome,
  SavedOutput,
  SummaryNotice,
  ToolDisplayAdapter
} from "../contracts.ts";
import type { AdapterFailureHandler } from "../interpretation.ts";
import type { ObservationSink } from "../observation/native.ts";
import { SavedOutputLoader } from "../observation/saved-output.ts";
import type { DisplaySettings } from "../settings.ts";
import { record } from "../values.ts";
import { TranscriptCoordinator } from "./coordinator.ts";
import { DisplayHistory, type HistorySource } from "./history.ts";
import { persistDisplayFact } from "./metadata.ts";

export type TranscriptMessage =
  | { kind: "boundary" }
  | { kind: "notice"; id: string; notice: SummaryNotice | undefined }
  | {
      kind: "result";
      id: string;
      name: string;
      result: AgentToolResult<unknown>;
      outcome: Outcome;
    }
  | {
      kind: "assistant";
      timestamp: number;
      boundary?: boolean;
      calls: readonly { index: number; id: string; name: string; args: unknown }[];
      interruption?: { outcome: "cancelled" | "failure"; text: string };
    };

export type AdapterSelector = (
  name: string,
  reference?: CallReference,
  args?: unknown
) => ToolDisplayAdapter | undefined;

type AssistantCall = Extract<TranscriptMessage, { kind: "assistant" }>["calls"][number];

type DisplaySessionOptions = {
  runtime: string;
  cwd: string;
  history: HistorySource;
  settings: DisplaySettings;
  /** A selector over one tool registry snapshot; registration can change between snapshots. */
  adapters(): AdapterSelector;
  expanded(): boolean;
  /** Initial transcript mode; the host owns later transitions. */
  mode?: DisplayMode;
  append?: ExtensionAPI["appendEntry"] | undefined;
  readSavedOutput?: (path: string) => Promise<SavedOutput>;
  onAdapterFailure?: AdapterFailureHandler;
};

function retainedAdapter(
  coordinator: TranscriptCoordinator,
  content: AssistantCall,
  timestamp: number,
  origin: DisplayCall["origin"]
): ToolDisplayAdapter | undefined {
  const existing = coordinator.byId(content.id);

  return existing?.name === content.name &&
    existing.origin === origin &&
    existing.reference.messageTimestamp === timestamp
    ? existing.adapter
    : undefined;
}

/** Session orchestration without a Pi runtime or terminal. All call writes go through the coordinator. */
export class DisplaySession {
  readonly coordinator: TranscriptCoordinator;
  readonly settings: DisplaySettings;
  private history: DisplayHistory;
  private output: SavedOutputLoader;
  private messages = new Set<string>();
  private assistants = new Map<number, { owner: object; after: DisplayCall | undefined }>();
  private noticeAnchor: DisplayCall | undefined;
  private disposed = false;
  private snapshot: AdapterSelector | undefined;
  constructor(private options: DisplaySessionOptions) {
    this.settings = options.settings;
    this.coordinator = new TranscriptCoordinator(options.runtime, {
      cwd: options.cwd,
      ...(options.mode ? { mode: options.mode } : {}),
      onExpansion: (call) => this.loadSavedOutput(call),
      ...(options.onAdapterFailure ? { onAdapterFailure: options.onAdapterFailure } : {})
    });
    this.history = new DisplayHistory(options.history);
    this.output = new SavedOutputLoader(options.readSavedOutput, (path) =>
      this.coordinator.evictSavedOutput(path)
    );
  }
  refreshAdapters(): void {
    if (this.disposed) return;

    // Registration can finish after reconstruction. Upgrade contracts without replaying calls.
    const select = this.options.adapters();
    this.coordinator.batch(() => {
      for (const call of this.coordinator.calls.values()) {
        if (call.origin !== "historical" || call.adapter.id !== "generic") continue;
        const selected = select(call.name);
        if (!selected || selected.id === "generic") continue;
        this.coordinator.setAdapter(call, selected);
        for (const fact of this.history.facts(call)) this.coordinator.fact(call, fact);
        if (call.result) this.retainPath(call, call.result);
      }
    });
  }
  /** Uses the reconstruction snapshot while one is open. */
  selectAdapter(name: string): ToolDisplayAdapter | undefined {
    return (this.snapshot ?? this.options.adapters())(name);
  }
  /** Rebuild history in one batch that shares one tool registry snapshot. */
  reconstruct<T>(update: () => T): T {
    const outer = !this.snapshot;
    this.snapshot ??= this.options.adapters();

    try {
      return this.coordinator.batch(update);
    } finally {
      if (outer) this.snapshot = undefined;
    }
  }
  beginObservation(id: string, adapter: string): ObservationSink | undefined {
    const call = this.coordinator.byId(id);
    if (this.disposed || !call || call.origin !== "live" || call.adapter.id !== adapter)
      return undefined;
    const source = this.history.messageEntry(
      call.reference.messageTimestamp,
      call.reference.contentIndex,
      call.reference.toolCallId
    );
    if (source) this.coordinator.setReferenceEntry(call, source);

    return {
      started: () => this.coordinator.update(call, "executing"),
      fact: (fact) => this.observe(call, fact),
      preview: (output) => this.coordinator.preview(call, output)
    };
  }
  private observe(call: DisplayCall, fact: DisplayFact): void {
    if (this.disposed) return;
    this.coordinator.fact(call, fact);
    if (this.options.append && call.origin === "live")
      persistDisplayFact(this.options.append, call.reference, call.adapter.id, fact);
  }
  private loadSavedOutput(call: DisplayCall): void {
    const path = call.savedPath;
    if (
      this.disposed ||
      !path ||
      !call.expanded ||
      (call.savedOutput?.path === path && !call.savedOutput.retryable) ||
      call.lifecycle !== "complete"
    )
      return;
    this.coordinator.setSavedOutput(call, undefined);
    void this.output
      .load(path)
      .then((output) => {
        if (this.disposed || !output || call.savedPath !== path || this.output.wasEvicted(output))
          return;
        this.coordinator.setSavedOutput(call, output);
      })
      .catch(() => {});
  }
  private retainPath(call: DisplayCall, result: BorrowedToolResult): void {
    if (!call.adapter.savedOutput) return;
    const path = record(result.details).fullOutputPath;
    if (typeof path === "string") this.coordinator.setSavedPath(call, path);
    this.loadSavedOutput(call);
  }
  /** Pi started the call; native observation may already have reported it executing. */
  queued(id: string): void {
    const call = this.coordinator.byId(id);
    if (call && call.lifecycle !== "executing") this.coordinator.update(call, "queued");
  }
  result(id: string, result: AgentToolResult<unknown>, outcome: Outcome, partial = false): void {
    if (this.disposed) return;
    const call = this.coordinator.byId(id);
    if (!call) return;
    this.coordinator.batch(() => {
      if (!partial && outcome === "cancelled" && call.origin === "live" && !call.cancellation)
        this.observe(call, { kind: "cancellation", availability: "available" });
      this.coordinator.result(call, result, outcome, partial);
      this.retainPath(call, result);
    });
  }
  message(
    input: TranscriptMessage | undefined,
    origin: DisplayCall["origin"],
    complete = true
  ): void {
    if (this.disposed || !input) return;
    const coordinator = this.coordinator;

    if (input.kind === "notice") {
      const key = `notice:${input.id}`;
      if (this.messages.has(key)) return;
      this.messages.add(key);
      const call = this.noticeAnchor;

      if (call) {
        coordinator.setBoundary(input, call, "group");
        if (input.notice) coordinator.addSummaryNotice(call, input.notice);
      }

      return;
    }

    if (input.kind === "boundary") {
      coordinator.boundary();
      this.noticeAnchor = undefined;

      return;
    }

    if (input.kind === "result") {
      const call = coordinator.byId(input.id);
      if (call?.name === input.name) this.result(input.id, input.result, input.outcome);

      return;
    }

    const select = this.snapshot ?? this.options.adapters();
    coordinator.batch(() => {
      let boundary = this.assistants.get(input.timestamp);

      if (!boundary) {
        boundary = { owner: {}, after: [...coordinator.calls.values()].at(-1) };
        this.assistants.set(input.timestamp, boundary);
      }

      coordinator.setBoundary(boundary.owner, input.boundary ? boundary.after : undefined);
      if (input.boundary) this.noticeAnchor = undefined;

      for (const content of input.calls) {
        const position = JSON.stringify([input.timestamp, content.index, content.id]);
        const source = this.history.messageEntry(input.timestamp, content.index, content.id);
        const reference: CallReference = {
          messageTimestamp: input.timestamp,
          contentIndex: content.index,
          toolCallId: content.id,
          ...(source ? { messageEntryId: source } : {})
        };
        const selected =
          retainedAdapter(coordinator, content, input.timestamp, origin) ??
          select(content.name, reference, content.args);

        if (!selected) {
          if (!this.messages.has(position)) coordinator.boundary();
          this.messages.add(position);
          continue;
        }

        if (selected.separateRun) coordinator.boundary();
        const call = coordinator.add(
          reference,
          content.name,
          content.args,
          selected,
          origin,
          this.options.expanded()
        );
        this.noticeAnchor = call;
        if (selected.separateRun) coordinator.boundary(call);
        if (origin === "historical")
          for (const fact of this.history.facts(call)) coordinator.fact(call, fact);
        if (origin === "live" && complete) coordinator.update(call, "queued");
        if (call.lifecycle !== "complete" && input.interruption)
          coordinator.result(
            call,
            { content: [{ type: "text", text: input.interruption.text }], details: undefined },
            input.interruption.outcome
          );
      }
    });
  }
  dispose(): void {
    this.disposed = true;
    this.coordinator.dispose();
    this.output.dispose();
    this.messages.clear();
    this.assistants.clear();
  }
}
