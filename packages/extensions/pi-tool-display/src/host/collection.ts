import { randomUUID } from "node:crypto";

import {
  sessionEntryToContextMessages,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";

import type { ToolDisplayAdapter } from "../contracts.ts";
import type { DisplaySettings } from "../settings.ts";
import { executionOutcome, hostToolResult, TranscriptMessages } from "../transcript/messages.ts";
import { TranscriptPublisher } from "../transcript/publisher.ts";
import { DisplaySession, type AdapterSelector } from "../transcript/session.ts";
import { displaySettings } from "./configuration.ts";
import { NativeRegistry } from "./native-registry.ts";
import { selectAdapter } from "./selection.ts";

/** Collection belongs to the session, including when no terminal is attached. */
export class DisplayCollector {
  readonly sessionId: string;
  display: DisplaySession;
  readonly settings: DisplaySettings;
  readonly publisher: TranscriptPublisher;
  private messages = new TranscriptMessages(true);
  private events = new WeakSet<AgentSessionEvent>();
  private unsubscribe: () => void;
  private active = true;
  private expanded = () => false;

  constructor(
    readonly session: AgentSession,
    private owner: DisplayCollectors,
    private append?: ExtensionAPI["appendEntry"]
  ) {
    this.sessionId = session.sessionManager.getSessionId();
    this.settings = displaySettings(session);
    this.settings.warnings.forEach((text) => owner.warning(text));
    this.display = this.createDisplay();
    this.publisher = new TranscriptPublisher(session, () => this.display, append);
    this.unsubscribe = session.subscribe((event) => this.event(event));
  }

  private createDisplay(): DisplaySession {
    return new DisplaySession({
      runtime: randomUUID(),
      cwd: this.session.sessionManager.getCwd(),
      history: this.session.sessionManager,
      settings: this.settings,
      adapters: () => this.owner.adapters(this.session, this.settings),
      onAdapterFailure: (adapter) => this.owner.adapterFailure(adapter),
      expanded: () => this.expanded(),
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

  attach(expanded: () => boolean): void {
    this.expanded = expanded;
  }

  event(event: AgentSessionEvent): void {
    if (!this.active || this.events.has(event)) return;
    this.events.add(event);

    try {
      if (nested(event)) return;

      const display = this.display;

      this.message(event);

      if (event.type === "tool_execution_start") display.queued(event.toolCallId);
      if (event.type === "tool_execution_update" || event.type === "tool_execution_end")
        display.result(
          event.toolCallId,
          hostToolResult(
            event.type === "tool_execution_update" ? event.partialResult : event.result
          ),
          event.type === "tool_execution_end"
            ? executionOutcome(event.isError, this.session.agent.signal)
            : "success",
          event.type === "tool_execution_update"
        );
      if (event.type === "agent_end") display.coordinator.settle();
      if (
        [
          "tool_execution_start",
          "tool_execution_end",
          "turn_end",
          "agent_end",
          "agent_settled"
        ].includes(event.type)
      )
        this.publisher.publish();
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
      if (event.type === "message_end" && message?.kind === "assistant")
        this.publisher.capture(
          message.timestamp,
          message.calls,
          this.owner.adapters(this.session, this.settings)
        );
    }

    if (event.type === "entry_appended" && event.entry.type === "custom_message")
      for (const message of sessionEntryToContextMessages(event.entry))
        this.display.message(this.messages.read(message), "live");
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.unsubscribe();
    this.publisher.dispose();
    this.display.dispose();
  }
}

function nested(event: AgentSessionEvent): boolean {
  return "parentToolCallId" in event && !!event.parentToolCallId;
}

/** The existing native registry discovers runtimes; only lifecycle or transcript mounting starts collection. */
export class DisplayCollectors {
  private active = true;
  private runtimes = new WeakMap<object, AgentSession>();
  private collectors = new Map<AgentSession, DisplayCollector>();
  private native: NativeRegistry;
  private failedAdapters = new Set<string>();

  constructor(
    private append?: ExtensionAPI["appendEntry"],
    private warn: (message: string) => void = () => {}
  ) {
    this.native = new NativeRegistry(
      (session) => this.collectors.get(session)?.display,
      (text) => this.warning(text),
      (session) => this.runtimes.set(session.sessionManager, session)
    );
  }

  warning(text: string): void {
    try {
      this.warn(`pi-tool-display: ${text}`);
    } catch {
      /* Diagnostics cannot change execution. */
    }
  }

  adapterFailure(adapter: ToolDisplayAdapter): void {
    for (const collector of this.collectors.values()) collector.publisher.request();
    if (this.failedAdapters.has(adapter.id)) return;
    this.failedAdapters.add(adapter.id);
    this.warning(`display adapter ${adapter.id} failed; its calls render generically.`);
  }

  adapters(session: AgentSession, configuration: DisplaySettings): AdapterSelector {
    let tools: Map<string, ToolInfo> | undefined;

    return (name) => {
      const definition = session.getToolDefinition(name);
      tools ??= new Map(session.getAllTools().map((tool) => [tool.name, tool]));
      const info = tools.get(name);

      return selectAdapter(
        configuration,
        name,
        definition && session.extensionRunner.resolveToolRenderers(name, () => definition),
        this.native.isNative(session, name, info),
        info
      );
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
    this.native.bind(session, () => {
      const select = this.adapters(session, collector.settings);

      return ["bash", "powershell", "edit", "write"].some(
        (name) => select(name)?.id === `pi:${name}`
      );
    });

    return collector;
  }

  start(manager: object): boolean {
    const session = this.runtimes.get(manager);
    if (!session) return false;
    this.get(session)?.publisher.start();

    return true;
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    for (const collector of this.collectors.values()) collector.dispose();
    this.collectors.clear();
    this.native.dispose();
  }
}
