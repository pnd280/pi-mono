import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadTitleConfig } from "./config.ts";
import { generateTitle } from "./generate.ts";
import { SessionTitle } from "./runtime.ts";

export default function piSessionTitle(pi: ExtensionAPI): void {
  let title: SessionTitle | undefined;

  pi.on("session_start", (_event, ctx) => {
    title?.dispose();
    const config = loadTitleConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
    title = new SessionTitle({
      getSessionName: () => pi.getSessionName(),
      setSessionName: (name) => pi.setSessionName(name),
      getBranch: () => ctx.sessionManager.getBranch(),
      generate: (source, signal) =>
        generateTitle({ config, registry: ctx.modelRegistry, source, signal }),
      notify: (message, type) => {
        if (ctx.hasUI) ctx.ui.notify(message, type);
      }
    });
  });
  pi.on("message_start", (event, ctx) => {
    if (event.message.role === "user") void title?.automatic(event.message, ctx.signal);
  });
  pi.on("session_info_changed", () => title?.nameChanged());
  pi.on("session_before_tree", () => title?.cancel());
  pi.on("session_tree", () => title?.cancel());
  pi.on("session_shutdown", () => title?.dispose());
  pi.registerCommand("auto-name", {
    description: "Regenerate the session title, or clear it with /auto-name clear",
    getArgumentCompletions: (prefix) => {
      // A complete argument must submit instead of accepting an identical completion first.
      if (prefix === "clear" || !"clear".startsWith(prefix)) return null;

      return [{ value: "clear", label: "clear", description: "Clear the session title" }];
    },
    handler: async (args) => {
      await title?.command(args);
    }
  });
}
