/**
 * Temporary workaround for https://github.com/earendil-works/pi/issues/5581.
 *
 * Problem: `pi.sendMessage(msg, { triggerTurn: true })` on an idle agent starts a run
 * through a short path that skips agent-run preparation. `before_agent_start` does not run,
 * so extension changes to the system prompt and tools are missing. On a fresh session,
 * the system prompt can be empty.
 *
 * Workaround: start the run through the normal `prompt()` path, and attach the custom
 * message to it.
 *
 * 1. `sendMessage(..., { deliverAs: "nextTurn" })` adds the message to an in-memory queue.
 *    It does not start a turn, and it ignores `triggerTurn`. The queue push occurs before
 *    the first `await` in `sendCustomMessage`, so it is complete before step 2 starts.
 * 2. `sendUserMessage("")` runs `prompt()`, which runs `before_agent_start`. Then it sends
 *    the empty user message plus all queued `nextTurn` messages in one request.
 *
 * Limits:
 * - Some providers (for example Anthropic) reject empty or whitespace-only text blocks.
 *   If this occurs, use a short placeholder text for the user message.
 * - If the agent is busy, `sendUserMessage` fails with "Agent is already processing".
 *   The custom message then stays in the queue until the next user prompt.
 *
 * Remove this extension when issue 5581 is fixed.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("empty-then-send", {
    description: "Send a custom message through the normal prompt path",
    handler: async (args) => {
      pi.sendMessage(
        { customType: "empty-then-send", content: args, display: true },
        { deliverAs: "nextTurn" }
      );
      pi.sendUserMessage("");
    }
  });
}
