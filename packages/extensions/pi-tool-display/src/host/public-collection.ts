import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  CONFIG_DIR_NAME,
  getAgentDir,
  SettingsManager,
  type AgentEndEvent,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";

import { loadDisplaySettings } from "../settings.ts";
import { executionOutcome, hostToolResult, TranscriptMessages } from "../transcript/messages.ts";
import { TranscriptPublisher } from "../transcript/publisher.ts";
import { DisplaySession } from "../transcript/session.ts";
import { publicAdapter } from "./selection.ts";

/** Compatibility fallback: public lifecycle/registry data can still verify extension contracts. */
export class PublicCollector {
  private display: DisplaySession;
  private publisher: TranscriptPublisher;
  private messages = new TranscriptMessages(true);
  private active = true;

  constructor(pi: ExtensionAPI, ctx: ExtensionContext, warning: (text: string) => void) {
    const manager = SettingsManager.create(ctx.cwd);
    const settings = loadDisplaySettings([
      { path: join(getAgentDir(), "settings.json"), settings: manager.getGlobalSettings() },
      ...(ctx.isProjectTrusted()
        ? [
            {
              path: join(ctx.cwd, CONFIG_DIR_NAME, "settings.json"),
              settings: manager.getProjectSettings()
            }
          ]
        : [])
    ]);
    settings.warnings.forEach(warning);
    this.display = new DisplaySession({
      runtime: randomUUID(),
      cwd: ctx.cwd,
      history: ctx.sessionManager,
      settings,
      expanded: () => false,
      adapters: () => {
        const tools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));

        return (name) => publicAdapter(settings, name, tools.get(name));
      }
    });
    this.publisher = new TranscriptPublisher(
      { sessionManager: ctx.sessionManager, getAllTools: () => pi.getAllTools() },
      () => this.display,
      (type, data) => pi.appendEntry(type, data)
    );
    this.publisher.start();
  }

  event(event: AgentSessionEvent | AgentEndEvent): void {
    if (!this.active || ("parentToolCallId" in event && event.parentToolCallId)) return;

    if (
      event.type === "message_start" ||
      event.type === "message_update" ||
      event.type === "message_end"
    ) {
      const message = this.messages.read(event.message);
      this.display.message(message, "live", event.type === "message_end");
      if (event.type === "message_end" && message?.kind === "assistant")
        this.publisher.capture(message.timestamp, message.calls, (name) =>
          this.display.selectAdapter(name)
        );
    }

    if (event.type === "tool_execution_start") this.display.queued(event.toolCallId);
    if (event.type === "tool_execution_end")
      this.display.result(
        event.toolCallId,
        hostToolResult(event.result),
        executionOutcome(event.isError)
      );
    if (event.type === "agent_end") this.display.coordinator.settle();
    if (event.type === "turn_end" || event.type === "agent_end" || event.type === "agent_settled")
      this.publisher.publish();
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.publisher.dispose();
    this.display.dispose();
  }
}
