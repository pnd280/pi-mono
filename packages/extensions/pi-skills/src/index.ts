import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { loadSkillConfig } from "./config.ts";
import { getSkillPaths } from "./skills.ts";
import { defaultExpansionFormat, expandSkillTokens } from "./tokens.ts";

export default function skills(pi: ExtensionAPI): void {
  const getCommands = () => pi.getCommands();
  let format = defaultExpansionFormat;

  pi.on("input", (event) => {
    const paths = getSkillPaths(getCommands());
    const expanded = expandSkillTokens(event.text, paths, format);
    const leadingCommand = expanded.match(/^\/skill:[^ ]+/u)?.[0];
    // Pi expands recognized skill commands at the start of input after extension handlers run.
    const text = leadingCommand && paths.has(leadingCommand) ? ` ${expanded}` : expanded;

    if (text !== event.text) return { action: "transform", text };
  });

  pi.on("session_start", (_event, ctx) => {
    format = loadSkillConfig(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() }).expansionFormat;
    if (ctx.mode !== "tui") return;

    ctx.ui.addAutocompleteProvider((current) =>
      createSkillAutocompleteProvider(current, getCommands)
    );
  });
}
