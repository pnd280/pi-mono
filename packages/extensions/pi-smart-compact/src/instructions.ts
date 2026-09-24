import type { TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionRunner } from "@earendil-works/pi-coding-agent";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DefaultCompaction, NativeSession } from "./compatibility.ts";

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

async function summarizeWithInstructions(
  session: NativeSession,
  summarize: DefaultCompaction,
  args: Parameters<DefaultCompaction>,
  instructions: string
) {
  args[4] = instructions;
  const hooks = new OwnedHooks();
  const stream = session.agent.streamFunction;
  let active = true;

  try {
    hooks.replace(session.agent, "streamFunction", (model, context, options) =>
      stream(
        model,
        active && options?.signal === args[5] ? focusSplitTurn(context, instructions) : context,
        options
      )
    );

    return await summarize(...args);
  } finally {
    active = false;
    hooks.restore();
  }
}

export async function runWithInstructions(session: NativeSession, instructions: string) {
  const hooks = new OwnedHooks();
  const runner = session._extensionRunner;
  const emit = runner.emit.bind(runner);
  const summarize = session._runDefaultCompaction.bind(session);
  let active = true;
  const ownsRequest = (signal: AbortSignal | undefined) =>
    active && signal !== undefined && signal === session._autoCompactionAbortController?.signal;

  try {
    const focusedSummary: DefaultCompaction = (...args) => {
      if (args[7] === "manual" && ownsRequest(args[5])) {
        return summarizeWithInstructions(session, summarize, args, instructions);
      }

      return summarize(...args);
    };

    hooks.replace(session, "_runDefaultCompaction", focusedSummary);

    const focusedEmit: ExtensionRunner["emit"] = (event) => {
      if (
        event.type === "session_before_compact" &&
        event.reason === "manual" &&
        ownsRequest(event.signal)
      ) {
        event = { ...event, customInstructions: instructions };
      }

      return emit(event);
    };

    hooks.replace(runner, "emit", focusedEmit);
    await session._runAutoCompaction("manual", false);
  } finally {
    active = false;
    hooks.restore();
  }
}
