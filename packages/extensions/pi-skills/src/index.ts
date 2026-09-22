import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { getSkillPaths } from "./skills.ts";
import { expandSkillTokens } from "./tokens.ts";

export default function skills(pi: ExtensionAPI): void {
  const getCommands = () => pi.getCommands();

  pi.on("input", (event) => {
    const text = expandSkillTokens(event.text, getSkillPaths(getCommands()));

    if (text !== event.text) return { action: "transform", text };
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.addAutocompleteProvider((current) =>
      createSkillAutocompleteProvider(current, getCommands)
    );
  });
}
