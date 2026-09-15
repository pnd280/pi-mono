import { setTimeout as delay } from "node:timers/promises";

import {
  createAssistantMessageEventStream,
  createProvider,
  type AssistantMessage,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function provider(pi: ExtensionAPI) {
  const stream: ProviderStreams["stream"] = (model, _context, options) => {
    const events = createAssistantMessageEventStream();
    const message: AssistantMessage = {
      role: "assistant",
      api: model.api,
      provider: model.provider,
      model: model.id,
      content: [],
      timestamp: Date.now(),
      stopReason: "stop",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      }
    };

    void (async () => {
      try {
        events.push({ type: "start", partial: message });
        await delay(500, undefined, { signal: options?.signal });
        message.content.push({ type: "text", text: "Offline fixture completed." });
        events.push({ type: "text_start", contentIndex: 0, partial: message });
        events.push({
          type: "text_delta",
          contentIndex: 0,
          delta: "Offline fixture completed.",
          partial: message
        });
        events.push({
          type: "text_end",
          contentIndex: 0,
          content: "Offline fixture completed.",
          partial: message
        });
        events.push({ type: "done", reason: "stop", message });
      } catch {
        message.stopReason = "aborted";
        events.push({ type: "error", reason: "aborted", error: message });
      } finally {
        events.end();
      }
    })();

    return events;
  };

  pi.registerProvider(
    createProvider({
      id: "prompt-fixture",
      auth: {
        apiKey: {
          name: "Offline fixture",
          resolve: async () => ({ auth: { apiKey: "offline" }, source: "fixture" })
        }
      },
      models: [
        {
          id: "offline",
          name: "Offline prompt fixture",
          api: "prompt-fixture",
          provider: "prompt-fixture",
          baseUrl: "http://localhost.invalid",
          reasoning: false,
          input: ["text"],
          contextWindow: 200000,
          maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }
      ],
      api: { stream, streamSimple: stream }
    })
  );
  pi.registerCommand("fixture-custom", {
    description: "Append an allowlisted fixture message outside a turn",
    handler: async () => {
      pi.sendMessage({
        customType: "allow",
        content: "Allowlisted outside agent execution.",
        display: false
      });
    }
  });
  pi.on("before_agent_start", (event) =>
    event.prompt === "with-custom"
      ? {
          message: {
            customType: "allow",
            content: "Allowlisted during agent execution.",
            display: false
          }
        }
      : undefined
  );
}
