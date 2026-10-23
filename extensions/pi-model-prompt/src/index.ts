import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinPromptParts } from "@pi-mono/libs/prompt-parts";
import { displayText } from "@pi-mono/libs/tui/terminal-text";

import { loadModelPromptSnapshot, type ModelPromptSnapshot } from "./model-prompt.ts";

/** Before pi-profiles (`200`), so the model text precedes the profile text. */
const PROMPT_RANK = 100;

export default function modelPrompt(pi: ExtensionAPI): void {
  const prompt = joinPromptParts(pi, { id: "pi-model-prompt" });
  let snapshot: ModelPromptSnapshot | undefined;

  // Startup and /reload both start a session, so edited settings and files apply after /reload.
  pi.on("session_start", (_event, ctx) => {
    snapshot = loadModelPromptSnapshot(getAgentDir());

    if (!ctx.hasUI) return;

    for (const warning of snapshot.warnings) {
      ctx.ui.notify(displayText(`pi-model-prompt: ${warning}`), "warning");
    }
  });

  // The coordinator calls parts after every hold, such as a profile's model switch, has settled,
  // so `ctx.model` is the model for this run.
  prompt.part(PROMPT_RANK, (ctx) => {
    const model = ctx.model;
    if (!snapshot || !model) return undefined;

    return snapshot.appendTextFor(`${model.provider}/${model.id}`);
  });
}
