/** The Pi extension API methods that `wakeIdle` calls. `ExtensionAPI` satisfies this type. */
export interface IdleWakeHost<Message> {
  sendMessage(message: Message, options: { deliverAs: "nextTurn" }): void;
  sendUserMessage(content: string): void;
}

/**
 * Start a turn on an idle agent with custom messages, and keep Pi's prompt preparation.
 *
 * Workaround for Pi issue 5581 (Pi 1.0.2; still open on 5 October 2026):
 * https://github.com/earendil-works/pi/issues/5581
 *
 * Issue: when the agent is idle, `sendMessage(message, { triggerTurn: true })` starts the
 * turn directly and does not use the prompt path. Thus `before_agent_start` does not run, and
 * the context that extensions prepare in that hook (system prompt, injected messages) is
 * missing from the turn.
 *
 * Workaround: queue the messages with `deliverAs: "nextTurn"`, then send `prompt` as a user
 * message. `sendUserMessage` uses the prompt path: it runs `before_agent_start` and adds the
 * queued messages to the same turn.
 *
 * Costs and constraints:
 * - The transcript shows `prompt` as an extra user message.
 * - Make both calls in the same synchronous block. If another prompt starts between them, it
 *   takes the queued messages, and `prompt` then starts a second turn without them.
 * - Call this only while the agent is idle. While it streams, use `followUp` delivery.
 *
 * When Pi fixes the issue, replace this helper with `sendMessage(message, { triggerTurn: true })`.
 */
export function wakeIdle<Message>(
  host: IdleWakeHost<NoInfer<Message>>,
  messages: readonly Message[],
  prompt: string
): void {
  for (const message of messages) host.sendMessage(message, { deliverAs: "nextTurn" });
  host.sendUserMessage(prompt);
}
