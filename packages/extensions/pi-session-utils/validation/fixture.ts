import { fauxProvider } from "@earendil-works/pi-ai";
import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFixtureMessage } from "@pi-mono/libs/validation/provider";

export default function fixture(pi: ExtensionAPI): void {
  // Without a resolved model, Pi 1.6.0 print mode warns "No models available" on stderr (main.js:762-764).
  pi.registerProvider(fauxProvider({ provider: "fixture", models: [{ id: "offline" }] }).provider);

  // Other extensions may reconstruct scratch sessions while resources are still loading.
  const scratch = SessionManager.inMemory();
  scratch.appendCustomEntry("fixture-scratch", {});
  scratch.buildSessionContext();

  pi.registerCommand("fixture-append", {
    handler: async (_args, ctx) => {
      if (!(ctx.sessionManager instanceof SessionManager))
        throw new Error("Expected a live session manager");
      const message = createFixtureMessage({
        api: "openai-completions",
        provider: "fixture",
        id: "offline"
      });
      message.content = [{ type: "text", text: "Offline fixture response" }];
      ctx.sessionManager.appendMessage(message);
    }
  });
  pi.registerCommand("fixture-reload", {
    handler: async (_args, ctx) => {
      await ctx.reload();
    }
  });
}
