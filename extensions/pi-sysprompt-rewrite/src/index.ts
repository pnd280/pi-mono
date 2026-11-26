import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { loadRewriteConfig, type RewriteConfig } from "./config.ts";
import { collapseDocs, latestDocsBody, syncDocsFile } from "./docs-collapse.ts";
import { rewriteSection } from "./rules.ts";

export default function syspromptRewrite(pi: ExtensionAPI): void {
  let config: RewriteConfig | undefined;

  const warn = (ctx: ExtensionContext, warning: string): void => {
    if (ctx.hasUI) ctx.ui.notify(`pi-sysprompt-rewrite: ${warning}`, "warning");
  };

  // Startup and /reload both start a session, so edited settings apply after /reload.
  pi.on("session_start", (_event, ctx) => {
    config = loadRewriteConfig({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });

    for (const warning of config.warnings) warn(ctx, warning);
  });

  // The event holds a request-local copy of the transcript, so the saved session keeps the original text.
  pi.on("context_with_system", async (event, ctx) => {
    const rules = config?.rules ?? [];
    const docsFile = config?.docsFile;
    const sectionsList = [];

    for (const message of event.messages) {
      if (message.role !== "system" || !message.sections) continue;

      if (docsFile) sectionsList.push(message.sections);

      for (const [name, content] of Object.entries(message.sections)) {
        if (typeof content === "string") {
          message.sections[name] = rewriteSection(rules, name, content);
        }
      }
    }

    const docsBody = latestDocsBody(sectionsList);

    if (!config || !docsFile || docsBody === undefined) return { messages: event.messages };

    try {
      await syncDocsFile(docsFile, docsBody);
    } catch {
      // Turning the collapse off keeps later requests' prompts stable after a failed write.
      config.docsFile = undefined;
      warn(ctx, "piDocsCollapse disabled for this session; the docs file could not be written");

      return { messages: event.messages };
    }

    collapseDocs(sectionsList, docsFile);

    return { messages: event.messages };
  });
}
