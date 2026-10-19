import { CustomEditor, keyText, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { TimedConfirmation } from "@pi-mono/libs/timed-confirmation";
import { overrideWorkingMessage } from "@pi-mono/libs/working-message";

const interrupt = "app.interrupt";
// Long enough to read the hint before the second press.
const confirmationMs = 1500;

/** Holds back interrupt presses in an editor that Pi or an earlier extension built. */
function guardEditor(editor: EditorComponent, holdInterrupt: () => boolean): void {
  // Pi's default editor, and an earlier extension's, can draw the working status in the top border.
  if ("embedWorkingStatus" in editor)
    Object.assign(editor, { embedWorkingStatus: false } satisfies Partial<CustomEditor>);

  const handleInput = editor.handleInput.bind(editor);
  const guarded: EditorComponent & Partial<Pick<CustomEditor, "onEscape">> = editor;

  guarded.handleInput = (data) => {
    // Pi sets onEscape after the factory returns, so read it at key time.
    // Let the editor resolve shortcuts, paste bindings, and autocomplete before guarding an interrupt.
    const onEscape = guarded.onEscape;

    if (onEscape)
      guarded.onEscape = () => {
        if (!holdInterrupt()) onEscape();
      };

    try {
      handleInput(data);
    } finally {
      if (onEscape) guarded.onEscape = onEscape;
    }
  };
}

export default function abortGuard(pi: ExtensionAPI): void {
  const hint = overrideWorkingMessage(pi);
  let confirmation: TimedConfirmation<typeof interrupt> | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const clearHint = () => hint.setText();
    const pending = new TimedConfirmation<typeof interrupt>({
      durationMs: confirmationMs,
      now: Date.now,
      expired: clearHint
    });
    confirmation = pending;

    const holdInterrupt = () => {
      if (ctx.isIdle()) return false;

      if (pending.confirm(interrupt)) {
        clearHint();

        return false;
      }

      hint.setText(ctx.ui.theme.fg("warning", `${keyText(interrupt)} again to interrupt`));

      return true;
    };

    // Pi clears the factory before session_start, so a previous one belongs to an earlier extension.
    const previous = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor =
        previous?.(tui, theme, keybindings) ??
        new CustomEditor(tui, theme, keybindings, { embedWorkingStatus: false });
      guardEditor(editor, holdInterrupt);

      return editor;
    });
  });

  // A press near the end of one operation must not count toward the next one.
  const clearConfirmation = () => {
    if (!confirmation?.armed) return;
    confirmation.cancel();
    hint.setText();
  };

  pi.on("agent_settled", clearConfirmation);
  pi.on("session_compact", clearConfirmation);
  pi.on("session_compact_failed", clearConfirmation);
  pi.on("session_tree", clearConfirmation);

  pi.on("session_shutdown", () => {
    confirmation?.dispose();
    confirmation = undefined;
  });
}
