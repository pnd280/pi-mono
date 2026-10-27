import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinInputChain } from "@pi-mono/libs/input-chain";

import { createSkillAutocompleteProvider } from "./autocomplete.ts";
import { loadExpansionFormat } from "./config.ts";
import { completeInlineSlash } from "./editor.ts";
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

    // Pi clears the factory before session_start, so a previous one belongs to an earlier extension.
    const previous = ctx.ui.getEditorComponent();
    let warned = false;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor =
        previous?.(tui, theme, keybindings) ??
        new CustomEditor(tui, theme, keybindings, { embedWorkingStatus: true });

      if (!completeInlineSlash(editor) && !warned) {
        warned = true;
        ctx.ui.notify(
          "pi-skills: typing / mid-prompt doesn't open skill completion with this Pi version or another extension's editor. Tab after /skill: still completes.",
          "warning"
        );
      }

      return editor;
    });
  });
}
