import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinInputChain } from "@pi-mono/libs/input-chain";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";

import type * as BrowserModule from "./browser.ts";
import { copyNative } from "./clipboard.ts";
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
  const lifecycle = joinLifecycle(pi, { id: "pi-prompt-manager" });
  const input = joinInputChain(pi, { id: "pi-prompt-manager" });
  let manager: PromptManager | undefined;
  let generation = 0;
  let finishing: Promise<void> = Promise.resolve();

  // Synchronous: new writes, UI updates, and callbacks stop before any shutdown handler awaits.
  const revoke = () => {
    generation++;
    const previous = manager;
    manager = undefined;
    if (previous) finishing = Promise.all([finishing, previous.dispose()]).then(() => undefined);
  };

  // Started atomic writes finish and cancelled changes release their locks before Pi can exit.
  lifecycle.onSessionShutdown(revoke, () => finishing);
  lifecycle.onSessionStart(async (_event, ctx, arrival) => {
    const activation = generation + 1;
    revoke();
    await finishing;
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
      arrival.claimShortcut(key, {
        description: "Browse prompt history",
        handler: () => current.open("history")
      });
    for (const key of settings.shortcuts.saveDraft)
      arrival.claimShortcut(key, {
        description: "Save exact editor draft",
        handler: () => current.saveEditor()
      });
    for (const warning of warnings) current.notify(`pi-prompt-manager: ${warning}`, "warning");
  });
  // Observers run before every input-chain transform, so history keeps the typed text.
  input.observe((event, ctx) => {
    if (ctx.mode !== "tui" || event.source !== "interactive") return;
    manager?.capture(event.text);
  });
}
