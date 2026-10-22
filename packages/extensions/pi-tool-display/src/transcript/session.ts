import type { AgentToolResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type {
  CallReference,
  DisplayCall,
  DisplayMode,
  Outcome,
  SavedOutput,
  SummaryNotice,
  ToolDisplayAdapter
} from "../contracts.ts";
import type { DisplayFailureHandler } from "../interpretation.ts";
import type { ObservationSink } from "../observation/native.ts";
import type { DisplaySettings } from "../settings.ts";
import { TranscriptCoordinator, type ValidatedArgs } from "./coordinator.ts";
import { DisplayHistory, type HistorySource } from "./history.ts";
import { SavedCalls, type SavedCallsOptions } from "./saved-calls.ts";
import { SavedOutputs } from "./saved-output.ts";

export type TranscriptMessage =
  | { kind: "boundary" }
  | { kind: "notice"; id: string; notice: SummaryNotice | undefined }
  | {
      kind: "result";
      id: string;
      name: string;
      result: AgentToolResult<unknown>;
      outcome: Outcome;
      durationMs?: number;
    }
  | {
      kind: "assistant";
      timestamp: number;
      boundary?: boolean;
      calls: readonly { index: number; id: string; name: string; args: unknown }[];
      interruption?: { outcome: "cancelled" | "failure"; text: string };
    };

/** One tool registry snapshot; registration can change between snapshots. */
export type ToolSnapshot = {
  adapter: (name: string) => ToolDisplayAdapter | undefined;
  args: ValidatedArgs;
};

type AssistantCall = Extract<TranscriptMessage, { kind: "assistant" }>["calls"][number];

type DisplaySessionOptions = {
  runtime: string;
  cwd: string;
  history: HistorySource;
  settings: DisplaySettings;
  tools(): ToolSnapshot;
  expanded(): boolean;
  /** Initial transcript mode; the host owns later transitions. */
  mode?: DisplayMode;
  append?: ExtensionAPI["appendEntry"] | undefined;
  warn: SavedCallsOptions["warn"];
  savedPaths?: SavedCallsOptions["savedPaths"];
  readSavedOutput?: (path: string) => Promise<SavedOutput>;
  onFailure?: DisplayFailureHandler;
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
  private saved: SavedCalls;
  private output: SavedOutputs;
  private messages = new Set<string>();
  private assistants = new Map<number, { owner: object; after: DisplayCall | undefined }>();
  private noticeAnchor: DisplayCall | undefined;
  private disposed = false;
  private snapshot: ToolSnapshot | undefined;
  constructor(private options: DisplaySessionOptions) {
    this.settings = options.settings;
    this.coordinator = new TranscriptCoordinator(options.runtime, {
      cwd: options.cwd,
      ...(options.mode ? { mode: options.mode } : {}),
      onSavedOutputChange: (call) => this.output.refresh(call),
      ...(options.onFailure ? { onFailure: options.onFailure } : {})
    });
    this.history = new DisplayHistory(options.history);
    this.saved = new SavedCalls({
      coordinator: this.coordinator,
      history: this.history,
      append: options.append,
      warn: options.warn,
      savedPaths: options.savedPaths
    });
    this.output = new SavedOutputs(this.coordinator, options.readSavedOutput);
  }
  refreshAdapters(): void {
    if (this.disposed) return;

    // Registration can finish after reconstruction. Upgrade contracts and validate
    // arguments against the new schemas without replaying calls.
    const tools = this.options.tools();
    this.coordinator.batch(() => {
      for (const call of this.coordinator.calls.values()) {
        if (call.origin !== "historical" || call.adapter.id !== "generic") continue;
        const selected = tools.adapter(call.name);
        const upgraded = selected && selected.id !== "generic" ? selected : undefined;
        this.coordinator.refreshTools(call, upgraded ?? call.adapter, tools.args);
        if (!upgraded) continue;
        this.saved.replay(call);
        if (call.result) this.output.retain(call, call.result);
      }
    });
  }
  /** Uses the reconstruction snapshot while one is open. */
  selectAdapter(name: string): ToolDisplayAdapter | undefined {
    return (this.snapshot ?? this.options.tools()).adapter(name);
  }
  /** Rebuild history in one batch that shares one tool registry snapshot. */
  reconstruct<T>(update: () => T): T {
    const outer = !this.snapshot;
    this.snapshot ??= this.options.tools();

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
    this.saved.observe(call);

    return {
      started: () => this.coordinator.update(call, "executing"),
      fact: (fact) => this.saved.fact(call, fact),
      preview: (output) => this.coordinator.preview(call, output)
    };
  }
  /** Pi started the call; native observation may already have reported it executing. */
  queued(id: string): void {
    const call = this.coordinator.byId(id);
    if (!call || this.disposed) return;
    if (call.lifecycle !== "executing") this.coordinator.update(call, "queued");
  }
  /**
   * Pi's execution event. Extensions can still replace the result before Pi saves it,
   * so the call's facts are saved with Pi's final result message.
   */
  result(
    id: string,
    result: AgentToolResult<unknown>,
    outcome: Outcome,
    partial = false,
    durationMs?: number
  ): void {
    const call = this.publish(id, result, outcome, partial, durationMs);
    if (call && !partial) this.saved.end(call, outcome);
  }
  private publish(
    id: string,
    result: AgentToolResult<unknown>,
    outcome: Outcome,
    partial = false,
    durationMs?: number
  ): DisplayCall | undefined {
    if (this.disposed) return;
    const call = this.coordinator.byId(id);
    if (!call) return;
    this.coordinator.batch(() => {
      if (!partial && outcome === "cancelled" && call.origin === "live" && !call.cancellation)
        this.coordinator.fact(call, { kind: "cancellation" });
      // Keep the path first, so completion loads only the final saved output.
      this.output.retain(call, result);
      this.coordinator.result(call, result, outcome, partial, durationMs);
      if (!partial) this.saved.replay(call);
    });

    return call;
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
      if (call?.name !== input.name) return;
      this.publish(input.id, input.result, input.outcome, false, input.durationMs);
      // Pi saves this message after its listeners, so facts written now precede it.
      if (origin === "live" && complete) this.saved.finish(call, input.result, input.outcome);

      return;
    }

    const tools = this.snapshot ?? this.options.tools();
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
        const selected =
          retainedAdapter(coordinator, content, input.timestamp, origin) ??
          tools.adapter(content.name);

        if (!selected) {
          if (!this.messages.has(position)) coordinator.boundary();
          this.messages.add(position);
          // Later notices belong to this tool, which keeps its own renderer.
          this.noticeAnchor = undefined;
          continue;
        }

        const source = this.history.messageEntry(input.timestamp, content.index, content.id);
        const reference: CallReference = {
          messageTimestamp: input.timestamp,
          contentIndex: content.index,
          toolCallId: content.id,
          ...(source ? { messageEntryId: source } : {})
        };
        const call = coordinator.add(
          reference,
          content.name,
          content.args,
          selected,
          origin,
          this.options.expanded(),
          tools.args
        );
        this.noticeAnchor = call;
        if (origin === "live" && complete) coordinator.update(call, "queued");
        if (call.lifecycle !== "complete" && input.interruption)
          coordinator.result(
            call,
            { content: [{ type: "text", text: input.interruption.text }], details: undefined },
            input.interruption.outcome
          );
        if (origin === "historical") this.saved.replay(call);
      }
    });
  }

  dispose(): void {
    this.saved.dispose();
    this.disposed = true;
    this.coordinator.dispose();
    this.output.dispose();
    this.messages.clear();
    this.assistants.clear();
  }
}
