import type { ToolDefinition, MessageRenderer } from "@earendil-works/pi-coding-agent";
import { Container, MouseRegion, Text, type Component } from "@earendil-works/pi-tui";
import { subagentDisplayAdapter, type ToolDisplayAdapter } from "pi-tool-display/adapters";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

import { detailsSchema, type ToolDetails } from "./result.ts";

export type CardState = { taskId?: string | undefined; bindingId?: string | undefined };

// Untyped arguments: Pi also draws replayed calls before the tool registers.
type Definition = ToolDefinition<ToolDefinition["parameters"], ToolDetails, CardState>;

type Renderers = Required<Pick<Definition, "renderShell" | "renderCall" | "renderResult">>;

export function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));

  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function createRenderers(
  open: (id: string, binding?: string) => void,
  name = "subagent",
  adapter: ToolDisplayAdapter = subagentDisplayAdapter
): Renderers {
  const renderers = createToolDisplayRenderers(name, adapter);
  const clickable = (card: Component, state: CardState) =>
    new MouseRegion(card, (event) => {
      if (!state.taskId || event.type !== "click" || event.button !== "left") return;
      open(state.taskId, state.bindingId);

      return { handled: true };
    });

  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      return clickable(renderers.renderCall(args, theme, context), context.state);
    },
    renderResult(result, options, theme, context) {
      const details = detailsSchema.safeParse(result.details).data;
      // Both slots read the latest identity, including when Pi retains the call component.
      context.state.taskId = details?.task_id;
      context.state.bindingId = details?.binding_id;

      return clickable(renderers.renderResult(result, options, theme, context), context.state);
    }
  };
}

export function resultRenderer(open: (id: string, binding?: string) => void): MessageRenderer {
  return (message, options, theme) => {
    const details = detailsSchema.safeParse(message.details).data;
    if (!details) return new Text("Subagent result unavailable", 0, 0);
    const content =
      typeof message.content === "string"
        ? [{ type: "text" as const, text: message.content }]
        : message.content;
    const renderers = createRenderers(open);
    const context = {
      args: { description: details.description, prompt: "" },
      toolCallId: details.task_id ?? "",
      invalidate: () => {},
      lastComponent: undefined,
      state: {},
      cwd: "",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: options.expanded,
      showImages: false,
      isError: details.state === "failed" || details.state === "cancelled"
    };
    const card = new Container();
    card.addChild(renderers.renderCall(context.args, theme, context));
    card.addChild(
      renderers.renderResult(
        { content, details },
        { expanded: options.expanded, isPartial: false },
        theme,
        context
      )
    );

    return card;
  };
}
