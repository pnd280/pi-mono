import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type StopReason,
  type Usage
} from "@earendil-works/pi-ai";

type FixtureModel = Pick<Model<Api>, "api" | "provider" | "id">;

type CompletionReason = Extract<StopReason, "stop" | "length" | "toolUse">;

/** Fresh nested objects for every message; no usage state is shared between fixtures. */
export function zeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  };
}

export function createFixtureMessage(
  model: FixtureModel,
  timestamp = Date.now()
): AssistantMessage {
  return {
    role: "assistant",
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [],
    timestamp,
    stopReason: "stop",
    usage: zeroUsage()
  };
}

export type FixtureStreamContext = {
  message: AssistantMessage;
  events: AssistantMessageEventStream;
  /** Append one complete text block and emit its start, delta, and end events. */
  text: (text: string) => void;
};

export type FixtureStreamOptions = {
  model: FixtureModel;
  signal?: AbortSignal | undefined;
  /** Scenarios, delays, tool calls, and cooperative cancellation remain in the fixture. */
  run: (context: FixtureStreamContext) => Promise<CompletionReason>;
};

/** Standard message lifecycle using Pi's event stream. No provider registration or transport. */
export function createFixtureStream({
  model,
  signal,
  run
}: FixtureStreamOptions): AssistantMessageEventStream {
  const events = createAssistantMessageEventStream();
  const message = createFixtureMessage(model);
  message.stopReason = "pending";

  void (async () => {
    try {
      signal?.throwIfAborted();
      events.push({ type: "start", partial: message });
      const reason = await run({
        message,
        events,
        text(text) {
          const contentIndex = message.content.length;
          message.content.push({ type: "text", text });
          events.push({ type: "text_start", contentIndex, partial: message });
          events.push({ type: "text_delta", contentIndex, delta: text, partial: message });
          events.push({ type: "text_end", contentIndex, content: text, partial: message });
        }
      });
      signal?.throwIfAborted();
      message.stopReason = reason;
      events.push({ type: "done", reason, message });
    } catch (error) {
      const reason = signal?.aborted ? "aborted" : "error";
      message.stopReason = reason;
      message.errorMessage = error instanceof Error ? error.message : String(error);
      events.push({ type: "error", reason, error: message });
    } finally {
      events.end();
    }
  })();

  return events;
}
