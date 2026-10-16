import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { contentText, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** File in the working directory that records why the stalled title request was aborted. */
export const stallAbortFile = "stall-title-abort.json";

/** Offline CLI fixture. No credentials, catalog requests, or model transport. */
export default function fixtureProvider(pi: ExtensionAPI): void {
  const titleStarted = Promise.withResolvers<void>();
  const titleCommitted = Promise.withResolvers<void>();
  pi.on("session_info_changed", ({ name }) => {
    if (name) titleCommitted.resolve();
  });
  const faux = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "active" }, { id: "title" }]
  });
  faux.setResponses(
    Array.from({ length: 4 }, () => async (context, options, _state, model) => {
      const user = context.messages.find(({ role }) => role === "user");
      const stalled = contentText(user?.content ?? "").includes("stall-title");

      if (model.id === "active") {
        // Separate committed-title output from exit with title work still pending.
        await (stalled ? titleStarted.promise : titleCommitted.promise);

        return fauxAssistantMessage("Fixture reply");
      }

      titleStarted.resolve();

      if (stalled) {
        // No live timer: only host cancellation or the title deadline can release this response.
        // Record why it was released, so the test does not have to time the whole process.
        await new Promise<void>((resolve) => {
          const release = () => {
            const reason: unknown = options?.signal?.reason;
            writeFileSync(
              join(process.cwd(), stallAbortFile),
              JSON.stringify(
                reason instanceof Error ? { name: reason.name, message: reason.message } : reason
              )
            );
            resolve();
          };

          if (options?.signal?.aborted) release();
          else options?.signal?.addEventListener("abort", release, { once: true });
        });

        return fauxAssistantMessage("", { stopReason: "aborted" });
      }

      return fauxAssistantMessage("Offline session title");
    })
  );
  pi.registerProvider(faux.provider);
}
