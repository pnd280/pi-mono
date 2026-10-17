import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { loadModelPromptSnapshot, type ModelPromptSnapshot } from "./model-prompt.ts";

export default function modelPrompt(pi: ExtensionAPI): void {
  let snapshot: ModelPromptSnapshot | undefined;

  // Startup and /reload both start a session, so edited settings and files apply after /reload.
  pi.on("session_start", (_event, ctx) => {
    snapshot = loadModelPromptSnapshot(getAgentDir());

    if (!ctx.hasUI) return;

    for (const warning of snapshot.warnings) {
      ctx.ui.notify(displayText(`pi-model-prompt: ${warning}`), "warning");
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    const model = ctx.model;
    if (!snapshot || !model) return;

    // Pi builds these options again for each run, so the files are added once per run.
    const options = event.systemPromptOptions;
    const appendText = snapshot.appendTextFor(
      `${model.provider}/${model.id}`,
      options.appendSystemPrompt
    );
    if (appendText !== undefined) options.appendSystemPrompt = appendText;
  });
}
