import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { openBrowser } from "./browser/open.ts";
import { copyNative } from "./clipboard.ts";
import { completions } from "./commands.ts";
import { extensionInputEligible, installCustomAppend } from "./host/custom-append.ts";
import { editorPort } from "./host/editor.ts";
import { PromptManager } from "./manager.ts";
import { errorMessage, type Repository } from "./model.ts";
import { loadSettings } from "./settings.ts";
import { FileRepository } from "./storage/repository.ts";

export default function promptManager(pi: ExtensionAPI): void {
  let manager: PromptManager | undefined;
  let detach: (() => void) | undefined;
  let generation = 0;

  const dispose = async () => {
    generation++;
    const previous = manager;
    manager = undefined;
    const remove = detach;
    detach = undefined;
    // Expiry precedes awaiting either the previous write or a new activation.
    const finishing = previous?.dispose();

    try {
      remove?.();
    } finally {
      await finishing;
    }
  };

  pi.on("session_shutdown", dispose);
  pi.on("session_start", async (_event, ctx) => {
    const activation = generation + 1;
    await dispose();
    if (ctx.mode !== "tui" || activation !== generation) return;
    const agentDir = getAgentDir();
    const { settings, warnings } = await loadSettings(agentDir);

    if (activation !== generation) return;
    let repository: Repository;

    try {
      repository = await FileRepository.create({
        cwd: ctx.cwd,
        agentDir,
        retention: settings.historyRetention
      });
    } catch (error) {
      const message = errorMessage(error);
      warnings.push(message);
      repository = {
        read: async () => ({ status: "unavailable", message }),
        mutate: async () => ({ status: "failed", message })
      };
    }

    if (activation !== generation) return;
    const current = new PromptManager({
      repository,
      editor: editorPort(ctx),
      copy: copyNative,
      notify: (message, severity) => ctx.ui.notify(message, severity),
      open: (request) => openBrowser(ctx, current, request),
      now: () => new Date()
    });
    manager = current;
    pi.registerCommand("prompts", {
      description: "Browse private prompt history and saved drafts",
      getArgumentCompletions: completions,
      handler: (args) => current.command(args)
    });

    for (const key of settings.shortcuts.history)
      pi.registerShortcut(key, {
        description: "Browse prompt history",
        handler: () => current.open("history")
      });
    for (const key of settings.shortcuts.saveDraft)
      pi.registerShortcut(key, {
        description: "Save exact editor draft",
        handler: () => current.saveEditor()
      });
    for (const warning of warnings) current.notify(warning, "warning");

    if (settings.customMessageTypes.length) {
      detach = installCustomAppend({
        manager: ctx.sessionManager,
        allowlist: settings.customMessageTypes,
        capture: (text, recordedAt) => current.capture(text, recordedAt),
        now: () => new Date()
      });
      if (!detach)
        current.notify(
          "Custom-message append integration is unavailable; only that capture path is disabled.",
          "warning"
        );
    }
  });
  pi.on("input", (event, ctx) => {
    if (ctx.mode !== "tui" || !manager?.active) return;
    if (
      event.source === "interactive" ||
      (event.source === "extension" && extensionInputEligible(ctx.sessionManager))
    )
      manager.capture(event.text);
  });
}
