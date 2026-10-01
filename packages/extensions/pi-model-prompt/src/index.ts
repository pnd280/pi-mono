import { join } from "node:path";

import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadAppendFiles, resolveAppendReplacement, type AppendFiles } from "./append-files.ts";
import {
  loadModelPromptConfig,
  referencedFiles,
  selectAppendFiles,
  type ModelRule
} from "./config.ts";

export default function modelPrompt(pi: ExtensionAPI): void {
  let rules: ModelRule[] = [];
  let files: AppendFiles | undefined;

  // Pi's resource loader rereads APPEND_SYSTEM.md on startup and /reload, which both start a session.
  pi.on("session_start", (_event, ctx) => {
    const agentDir = getAgentDir();
    const config = loadModelPromptConfig(agentDir);
    rules = config.rules;
    files = loadAppendFiles({
      projectDir: ctx.isProjectTrusted() ? join(ctx.cwd, CONFIG_DIR_NAME) : undefined,
      agentDir,
      paths: referencedFiles(rules)
    });

    if (!ctx.hasUI) return;

    for (const warning of [...config.warnings, ...files.warnings]) {
      ctx.ui.notify(`pi-model-prompt: ${warning}`, "warning");
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    const model = ctx.model;
    if (!files || !model) return;

    const options = event.systemPromptOptions;
    const paths = selectAppendFiles(rules, `${model.provider}/${model.id}`);
    const replacement = resolveAppendReplacement(files, options.appendSystemPrompt, paths);
    if (replacement !== undefined) options.appendSystemPrompt = replacement;
  });
}
