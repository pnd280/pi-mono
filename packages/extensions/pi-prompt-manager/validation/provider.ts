import { setTimeout as delay } from "node:timers/promises";

import { createProvider, type ProviderStreams } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFixtureStream } from "@pi-mono/libs/validation/provider";

export default function provider(pi: ExtensionAPI) {
  const stream: ProviderStreams["stream"] = (model, _context, options) =>
    createFixtureStream({
      model,
      signal: options?.signal,
      async run({ text }) {
        await delay(500, undefined, { signal: options?.signal });
        text("Offline fixture completed.");

        return "stop";
      }
    });

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
}
