import type { TranscriptContext } from "@earendil-works/pi-ai";

// Match the native instruction suffix, never a phrase inside serialized history.
const prefixInstructions = `# Instructions
The messages above are earlier context from an ongoing conversation. Later messages are stored separately and do not need to be reconstructed.

Create a concise checkpoint of the user's request and the progress shown above. This checkpoint will be placed before the later messages so the conversation can continue with the necessary context.

## Original Request
[What did the user ask for?]

## Progress So Far
- [Key decisions and work completed in these messages]

## Context Needed to Continue
- [Information from these messages needed to understand the later work]

Only summarize information explicitly present above. Do not infer or recreate later messages.`;

export function focusSplitTurn(
  context: TranscriptContext,
  instructions: string
): TranscriptContext {
  if (!instructions) return context;
  const last = context.messages.at(-1);
  if (last?.role !== "user" || typeof last.content === "string" || last.content.length !== 1)
    return context;
  const block = last.content[0];
  if (
    block?.type !== "text" ||
    !block.text.startsWith("# Conversation\n") ||
    !block.text.endsWith(prefixInstructions)
  )
    return context;

  return {
    ...context,
    messages: [
      ...context.messages.slice(0, -1),
      {
        ...last,
        content: [{ ...block, text: `${block.text}\n\nAdditional focus: ${instructions}` }]
      }
    ]
  };
}
