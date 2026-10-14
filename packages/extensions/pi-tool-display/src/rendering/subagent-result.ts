import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import { Container, MouseRegion } from "@earendil-works/pi-tui";

import { subagentDisplayAdapter, subagentResultCard } from "../adapters/pi-subagents/index.ts";
import type { DisplayAction } from "../contracts.ts";
import { createToolDisplayRenderers } from "./cards.ts";
import type { DisplayContext } from "./types.ts";

/**
 * Background results use the standalone subagent card layout. Invalid details keep
 * Pi's default message box. A click emits the task's open action.
 */
export function createSubagentResultRenderer(
  emit: (action: DisplayAction) => void
): MessageRenderer {
  const renderers = createToolDisplayRenderers("subagent", subagentDisplayAdapter);

  return (message, { expanded, outputPad }, theme) => {
    const card = subagentResultCard(message);
    if (!card) return undefined;
    // A delivered result is final and has no live call.
    const context: DisplayContext = {
      args: card.args,
      toolCallId: "",
      invalidate: () => {},
      lastComponent: undefined,
      state: {},
      cwd: "",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded,
      showImages: false,
      isError: false,
      durationMs: undefined,
      outputPad
    };
    const container = new Container();
    container.addChild(renderers.renderCall(card.args, theme, context));
    container.addChild(
      renderers.renderResult(card.result, { expanded, isPartial: false }, theme, context)
    );
    const action = subagentDisplayAdapter.action?.(card.args, card.result);

    return new MouseRegion(container, (event) => {
      if (!action || event.type !== "click" || event.button !== "left") return;
      emit(action);

      return { handled: true };
    });
  };
}
