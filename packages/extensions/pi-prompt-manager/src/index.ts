import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyNative } from "@pi-mono/libs/native-clipboard";

import type * as BrowserModule from "./browser.ts";
import { completions } from "./commands.ts";
import { PromptManager } from "./manager.ts";
import { errorMessage, type Repository } from "./model.ts";
import { loadSettings } from "./settings.ts";
import { FileRepository } from "./storage/repository.ts";

// The browser and its shared TUI components load on first use, not at session start.
// Concurrent opens share one import: under jiti a concurrent import can return a partly evaluated module.
let browserModule: Promise<typeof BrowserModule> | undefined;
const loadBrowser = () => (browserModule ??= import("./browser.ts"));

export default function promptManager(pi: ExtensionAPI): void {
  let manager: PromptManager | undefined;
  let generation = 0;

  const dispose = async () => {
    generation++;
    const previous = manager;
    manager = undefined;
    await previous?.dispose();
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
      editor: {
        read: () => ctx.ui.getEditorText(),
        write: (text) => ctx.ui.setEditorText(text)
      },
      copy: copyNative,
      notify: (message, severity) => ctx.ui.notify(message, severity),
      open: async (request) => {
        // Read the host context before the browser loads; the session can end during the import.
        const ui = ctx.ui;
        const { openBrowser } = await loadBrowser();

        return openBrowser(
          ui,
          {
            read: (collection, signal) => repository.read(collection, signal),
            copy: (target) => current.copy(target),
            remove: (collection, target) => current.deleteOccurrence(collection, target),
            notify: (message, severity) => current.notify(message, severity)
          },
          request
        );
      },
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
    for (const warning of warnings) current.notify(`pi-prompt-manager: ${warning}`, "warning");
  });
  pi.on("input", (event, ctx) => {
    if (ctx.mode !== "tui" || event.source !== "interactive") return;
    manager?.capture(event.text);
  });
}
