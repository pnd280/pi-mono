import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import { Container, MouseRegion } from "@earendil-works/pi-tui";

import { subagentDisplayAdapter, subagentResultCard } from "../adapters/pi-subagents/index.ts";
import { jobResultCard, jobResultDisplayAdapter } from "../adapters/pi-subagents/jobs.ts";
import type { BorrowedToolResult, DisplayAction, ToolDisplayAdapter } from "../contracts.ts";
import { createToolDisplayRenderers } from "./cards.ts";
import type { DisplayContext } from "./types.ts";

type ResultCard = (
  message: Pick<Parameters<MessageRenderer>[0], "content" | "details">
) => { args: object; result: BorrowedToolResult } | undefined;

/**
 * Background results use a standalone progress card layout. Invalid details keep
 * Pi's default message box. A click emits the result's open action.
 */
function createResultRenderer(
  name: string,
  adapter: ToolDisplayAdapter,
  resultCard: ResultCard,
  emit: (action: DisplayAction) => void
): MessageRenderer {
  const renderers = createToolDisplayRenderers(name, adapter);

  return (message, { expanded, outputPad }, theme) => {
    const card = resultCard(message);
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
    const action = adapter.action?.(card.args, card.result);

    return new MouseRegion(container, (event) => {
      if (!action || event.type !== "click" || event.button !== "left") return;
      emit(action);

      return { handled: true };
    });
  };
}

/** `pi-subagents.result` messages use the standalone subagent card layout. */
export function createSubagentResultRenderer(
  emit: (action: DisplayAction) => void
): MessageRenderer {
  return createResultRenderer("subagent", subagentDisplayAdapter, subagentResultCard, emit);
}

/** `pi-subagents.job-result` messages show the job's outcome, output preview, and log path. */
export function createJobResultRenderer(emit: (action: DisplayAction) => void): MessageRenderer {
  return createResultRenderer("job", jobResultDisplayAdapter, jobResultCard, emit);
}
