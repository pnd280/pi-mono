import { setTimeout } from "node:timers/promises";

import { contentText, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Offline CLI fixture. No credentials, catalog requests, or model transport. */
export default function fixtureProvider(pi: ExtensionAPI): void {
  const faux = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "active" }, { id: "title" }]
  });
  faux.setResponses(
    Array.from({ length: 4 }, () => async (context, options, _state, model) => {
      if (model.id === "active") {
        // Give ordinary title generation time to finish, without requiring it for a reply.
        await setTimeout(30);

        return fauxAssistantMessage("Fixture reply");
      }

      if (contentText(context.messages[0]?.content ?? "").includes("stall-title")) {
        // No live timer: only host cancellation can release this response.
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) resolve();
          else options?.signal?.addEventListener("abort", () => resolve(), { once: true });
        });

        return fauxAssistantMessage("", { stopReason: "aborted" });
      }

      return fauxAssistantMessage("Offline session title");
    })
  );
  pi.registerProvider(faux.provider);
}
