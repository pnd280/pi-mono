import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadRewriteConfig, rewriteSection, type RewriteConfig } from "./rules.ts";

export default function syspromptRewrite(pi: ExtensionAPI): void {
  let config: RewriteConfig | undefined;

  // Startup and /reload both start a session, so edited settings apply after /reload.
  pi.on("session_start", (_event, ctx) => {
    config = loadRewriteConfig(getAgentDir());

    if (!ctx.hasUI) return;

    for (const warning of config.warnings) {
      ctx.ui.notify(`pi-sysprompt-rewrite: ${warning}`, "warning");
    }
  });

  // The event holds a request-local copy of the transcript, so the saved session keeps the original text.
  pi.on("context_with_system", (event) => {
    const rules = config?.rules ?? [];

    for (const message of event.messages) {
      if (message.role !== "system" || !message.sections) continue;

      for (const [name, content] of Object.entries(message.sections)) {
        if (typeof content === "string") {
          message.sections[name] = rewriteSection(rules, name, content);
        }
      }
    }

    return { messages: event.messages };
  });
}
