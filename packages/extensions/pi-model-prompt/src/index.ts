import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { loadModelPromptSnapshot, type ModelPromptSnapshot } from "./model-prompt.ts";

export default function modelPrompt(pi: ExtensionAPI): void {
  let snapshot: ModelPromptSnapshot | undefined;

  // Pi's resource loader rereads APPEND_SYSTEM.md on startup and /reload, which both start a session.
  pi.on("session_start", (_event, ctx) => {
    snapshot = loadModelPromptSnapshot({
      projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, CONFIG_DIR_NAME) : undefined,
      agentDir: getAgentDir()
    });

    if (!ctx.hasUI) return;

    for (const warning of snapshot.warnings) {
      ctx.ui.notify(displayText(`pi-model-prompt: ${warning}`), "warning");
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    const model = ctx.model;
    if (!snapshot || !model) return;

    const options = event.systemPromptOptions;
    const replacement = snapshot.replacementFor(
      `${model.provider}/${model.id}`,
      options.appendSystemPrompt
    );
    if (replacement !== undefined) options.appendSystemPrompt = replacement;
  });
}
