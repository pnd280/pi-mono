import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinInputChain } from "@pi-mono/libs/input-chain";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { loadExpansionFormat } from "./config.ts";
import { defaultExpansionFormat, expandSkillInput } from "./tokens.ts";

/** Expands references before later transforms; observers still see the typed text. */
const INPUT_RANK = 100;

export default function skills(pi: ExtensionAPI): void {
  const input = joinInputChain(pi, { id: "pi-skills" });
  const getCommands = () => pi.getCommands();
  let format = defaultExpansionFormat;

  // Pi's `input` event runs before its native skill insertion, so leading references stay literal.
  input.transform(INPUT_RANK, (event) => {
    const text = expandSkillInput(event.text, getCommands(), format);

    return text === event.text ? undefined : { action: "transform", text };
  });

  pi.on("session_start", (_event, ctx) => {
    format = loadExpansionFormat(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
    if (ctx.mode !== "tui") return;

    ctx.ui.addAutocompleteProvider((current) =>
      createSkillAutocompleteProvider(current, getCommands)
    );
  });
}
