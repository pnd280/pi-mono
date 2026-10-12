import { randomUUID } from "node:crypto";

import { validateToolArguments, type JsonObject } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  sessionEntryToContextMessages,
  VERSION,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";

import type { DisplayFailure } from "../interpretation.ts";
import type { DisplaySettings } from "../settings.ts";
import { executionOutcome, hostToolResult, TranscriptMessages } from "../transcript/messages.ts";
import { DisplaySession, type ToolSnapshot } from "../transcript/session.ts";
import { LocalStore } from "../transcript/store.ts";
import { displaySettings } from "./configuration.ts";
import { NativeRegistry } from "./native-registry.ts";
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
  /** One writer per collector; reconstruction keeps it. */
  private local: LocalStore;

  constructor(
    readonly session: AgentSession,
    private owner: DisplayCollectors,
    private append?: ExtensionAPI["appendEntry"]
  ) {
    const manager = session.sessionManager;
    this.sessionId = manager.getSessionId();
    this.local = new LocalStore({
      root: getAgentDir(),
      persisted: manager.isPersisted(),
      header: {
        sessionId: this.sessionId,
        sessionFile: manager.getSessionFile(),
        cwd: manager.getCwd(),
        pi: VERSION
      },
      warn: (text) => owner.warning(text)
    });
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
      local: this.local,
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
    } catch (error) {
      this.owner.warning("collection unavailable for this event; keeping original execution.");
      this.local.diagnostic({
        code: "collection-failed",
        detail: `${event.type}: ${error instanceof Error ? error.message : String(error)}`
      });
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

  /** Resolves when the local file holds every line this writer wrote, also when called again. */
  dispose(): Promise<void> {
    if (this.active) {
      this.unsubscribe();
      // Facts of running calls persist while this collector can still append.
      this.display.dispose();
      this.active = false;
    }

    return this.local.dispose();
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

/** The existing native registry discovers runtimes; only lifecycle or transcript mounting starts collection. */
export class DisplayCollectors {
  private active = true;
  private runtimes = new WeakMap<object, AgentSession>();
  private collectors = new Map<AgentSession, DisplayCollector>();
  /** Disposal of collectors replaced after a session ID change; final disposal waits for it. */
  private retired = new Set<Promise<void>>();
  private disposal: Promise<void> | undefined;
  private native: NativeRegistry;
  /** Failure kinds and adapter IDs already reported. */
  private failures = new Set<string>();

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
      const retired: Promise<void> = collector
        .dispose()
        .finally(() => this.retired.delete(retired));
      this.retired.add(retired);
      this.collectors.delete(session);
      collector = undefined;
    }

    if (collector) return collector;
    collector = new DisplayCollector(session, this, this.append);
    this.collectors.set(session, collector);
    this.native.bind(session, () => {
      const tools = this.tools(session, collector.settings);

      return ["bash", "powershell", "edit", "write"].some(
        (name) => tools.adapter(name)?.id === `pi:${name}`
      );
    });

    return collector;
  }

  start(manager: object): void {
    const session = this.runtimes.get(manager);
    if (session) this.get(session);
  }

  /** Repeated shutdowns share one wait, so none ends before the local files close. */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.active = false;
    const flushed = [...this.collectors.values()].map((collector) => collector.dispose());
    this.collectors.clear();
    this.native.dispose();
    this.disposal = Promise.all([...this.retired, ...flushed]).then(() => {});

    return this.disposal;
  }
}
