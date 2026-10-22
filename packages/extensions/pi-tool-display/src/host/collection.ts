import { randomUUID } from "node:crypto";

import { validateToolArguments, type JsonObject } from "@earendil-works/pi-ai";
import {
  sessionEntryToContextMessages,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { observeNativeTools } from "@pi-mono/libs/native-tools";

import type { DisplayFailure } from "../interpretation.ts";
import { displayMutationSink, observeNativeDefinition } from "../observation/native.ts";
import type { DisplaySettings } from "../settings.ts";
import {
  executionOutcome,
  hostToolResult,
  TranscriptMessages,
  validDuration
} from "../transcript/messages.ts";
import { DisplaySession, type ToolSnapshot } from "../transcript/session.ts";
import { displaySettings } from "./configuration.ts";
import { selectAdapter } from "./selection.ts";

/** Collection belongs to the session, including when no terminal is attached. */
export class DisplayCollector {
  readonly sessionId: string;
  display: DisplaySession;
  readonly settings: DisplaySettings;
  private messages = new TranscriptMessages(true);
  private events = new WeakSet<AgentSessionEvent>();
  private unsubscribe: () => void;
  private active = true;
  private expanded = () => false;
  /** Observed saved-output paths outlive transcript reconstruction, not this collector. */
  private savedPaths = new Map<string, string>();

  constructor(
    readonly session: AgentSession,
    private owner: DisplayCollectors,
    private append?: ExtensionAPI["appendEntry"]
  ) {
    this.sessionId = session.sessionManager.getSessionId();
    this.settings = displaySettings(session);
    this.settings.warnings.forEach((text) => owner.warning(text));
    this.display = this.createDisplay();
    this.unsubscribe = session.subscribe((event) => this.event(event));
  }

  private createDisplay(): DisplaySession {
    return new DisplaySession({
      runtime: randomUUID(),
      cwd: this.session.sessionManager.getCwd(),
      history: this.session.sessionManager,
      settings: this.settings,
      tools: () => this.owner.tools(this.session, this.settings),
      onFailure: (failure) => this.owner.failure(failure),
      expanded: () => this.expanded(),
      warn: (text) => this.owner.warning(text),
      savedPaths: this.savedPaths,
      append: (type, data) => {
        if (this.active && this.sessionId === this.session.sessionManager.getSessionId())
          this.append?.(type, data);
      }
    });
  }

  /** Reconstructing a cleared transcript replaces its call model, not the observer lifetime. */
  reconstruct(): DisplaySession {
    // A terminal remount must not invalidate in-flight native sinks or lose the current run.
    if (this.session.isStreaming) return this.display;
    this.display.dispose();
    this.display = this.createDisplay();
    this.messages = new TranscriptMessages(true);

    return this.display;
  }

  /** The terminal's expansion state for new calls; detach restores the default. */
  attach(expanded: () => boolean): () => void {
    this.expanded = expanded;

    return () => {
      if (this.expanded === expanded) this.expanded = () => false;
    };
  }

  event(event: AgentSessionEvent): void {
    if (!this.active || this.events.has(event)) return;
    this.events.add(event);

    try {
      if (nested(event)) return;

      const display = this.display;

      this.message(event);

      if (event.type === "tool_execution_start") display.queued(event.toolCallId);
      if (event.type === "tool_execution_update")
        display.result(event.toolCallId, hostToolResult(event.partialResult), "success", true);
      if (event.type === "tool_execution_end")
        display.result(
          event.toolCallId,
          hostToolResult(event.result),
          executionOutcome(event.isError, this.session.agent.signal),
          false,
          validDuration(event.durationMs) ? event.durationMs : undefined
        );
      if (event.type === "agent_end") display.coordinator.settle();
    } catch {
      this.owner.warning("collection unavailable for this event; keeping original execution.");
    }
  }

  private message(event: AgentSessionEvent): void {
    if (
      event.type === "message_start" ||
      event.type === "message_update" ||
      event.type === "message_end"
    ) {
      const index =
        event.type === "message_update" && "contentIndex" in event.assistantMessageEvent
          ? event.assistantMessageEvent.contentIndex
          : undefined;
      const message = this.messages.read(event.message, index);
      this.display.message(message, "live", event.type === "message_end");
    }

    if (event.type === "entry_appended" && event.entry.type === "custom_message")
      for (const message of sessionEntryToContextMessages(event.entry))
        this.display.message(this.messages.read(message), "live");
  }

  dispose(): void {
    if (!this.active) return;
    this.unsubscribe();
    // Facts of running calls persist while this collector can still append.
    this.display.dispose();
    this.active = false;
  }
}

function nested(event: AgentSessionEvent): boolean {
  return "parentToolCallId" in event && !!event.parentToolCallId;
}

/**
 * Validates a copy of the raw arguments against the current schema with Pi's validator,
 * which removes optional nulls that the schema rejects and converts values. Execution can
 * differ: Pi first applies the tool's `prepareArguments`, which display does not run
 * because it is tool code, and `tool_call` handlers can change the validated copy.
 */
function validatedArgs(tool: ToolInfo, args: unknown): unknown {
  try {
    return validateToolArguments(
      { name: tool.name, description: tool.description, parameters: tool.parameters },
      // Pi's tool calls carry JSON arguments. Validation clones them and rejects other values.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { type: "toolCall", id: "", name: tool.name, arguments: args as JsonObject }
    );
  } catch {
    return args;
  }
}

/** Native tool observation discovers runtimes; only lifecycle or transcript mounting starts collection. */
export class DisplayCollectors {
  private active = true;
  private runtimes = new WeakMap<object, AgentSession>();
  private collectors = new Map<AgentSession, DisplayCollector>();
  /** Display policy only; native provenance and mutation I/O are shared with other observers. */
  private native;
  private mutations;
  /** Failure kinds and adapter IDs already reported. */
  private failures = new Set<string>();

  constructor(
    private append?: ExtensionAPI["appendEntry"],
    private warn: (message: string) => void = () => {}
  ) {
    this.native = observeNativeTools({
      names: ["bash", "powershell"],
      eligible: (session, name) => this.eligible(session, name),
      wrap: (session, original, settings) =>
        observeNativeDefinition(original, settings, (id) =>
          this.collectors.get(session)?.display.beginObservation(id, `pi:${original.name}`)
        ),
      refreshed: (session) => {
        this.runtimes.set(session.sessionManager, session);
        this.collectors.get(session)?.display.refreshAdapters();
      },
      warning: (text) => this.warning(text)
    });
    this.mutations = observeFileMutations({
      eligible: (session, name) => this.eligible(session, name),
      begin: (session, name, id) => {
        const sink = this.collectors.get(session)?.display.beginObservation(id, `pi:${name}`);

        return sink ? displayMutationSink(sink, name) : undefined;
      }
    });
  }

  private eligible(session: AgentSession, name: string): boolean {
    const display = this.collectors.get(session)?.display;

    return (
      this.active &&
      !!display?.settings.valid &&
      (display.settings.rendererOverrides[name] ?? "auto") === "auto"
    );
  }

  warning(text: string): void {
    try {
      this.warn(`pi-tool-display: ${text}`);
    } catch {
      /* Diagnostics cannot change execution. */
    }
  }

  failure({ kind, adapter }: DisplayFailure): void {
    const key = JSON.stringify([kind, adapter.id]);
    if (this.failures.has(key)) return;
    this.failures.add(key);
    this.warning(
      kind === "adapter"
        ? `display adapter ${adapter.id} failed; its calls render generically.`
        : `display renderer failed for ${adapter.id} calls; they render generically.`
    );
  }

  tools(session: AgentSession, configuration: DisplaySettings): ToolSnapshot {
    let tools: Map<string, ToolInfo> | undefined;
    const registered = (name: string) =>
      (tools ??= new Map(session.getAllTools().map((tool) => [tool.name, tool]))).get(name);

    return {
      adapter: (name) => {
        const definition = session.getToolDefinition(name);
        const info = registered(name);

        return selectAdapter(
          configuration,
          name,
          definition && session.extensionRunner.resolveToolRenderers(name, () => definition),
          this.native.isNative(session, name, info),
          info
        );
      },
      args: (name, args) => {
        const info = registered(name);

        return info ? validatedArgs(info, args) : args;
      }
    };
  }

  get(session: AgentSession): DisplayCollector | undefined {
    if (!this.active) return;
    let collector = this.collectors.get(session);

    if (collector && collector.sessionId !== session.sessionManager.getSessionId()) {
      collector.dispose();
      this.collectors.delete(session);
      collector = undefined;
    }

    if (collector) return collector;
    collector = new DisplayCollector(session, this, this.append);
    this.collectors.set(session, collector);
    const tools = this.tools(session, collector.settings);
    if (
      ["bash", "powershell", "edit", "write"].some(
        (name) => tools.adapter(name)?.id === `pi:${name}`
      )
    )
      this.native.bind(session);

    return collector;
  }

  start(manager: object): void {
    const session = this.runtimes.get(manager);
    if (session) this.get(session);
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    for (const collector of this.collectors.values()) collector.dispose();
    this.collectors.clear();
    this.mutations.dispose();
    this.native.dispose();
  }
}
