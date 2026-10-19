import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { loadExpansionFormat } from "./config.ts";
import { defaultExpansionFormat, expandSkillInput } from "./tokens.ts";

export default function skills(pi: ExtensionAPI): void {
  const getCommands = () => pi.getCommands();
  let format = defaultExpansionFormat;

  pi.on("input", (event) => {
    const text = expandSkillInput(event.text, getCommands(), format);

    if (text !== event.text) return { action: "transform", text };
  });

  pi.on("session_start", (_event, ctx) => {
    format = loadExpansionFormat(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
    if (ctx.mode !== "tui") return;

    ctx.ui.addAutocompleteProvider((current) =>
      createSkillAutocompleteProvider(current, getCommands)
    );
  });
}
