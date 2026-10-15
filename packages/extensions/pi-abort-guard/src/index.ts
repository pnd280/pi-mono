import {
  CustomEditor,
  keyText,
  type ExtensionAPI,
  type KeybindingsManager
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { TimedConfirmation } from "@pi-mono/libs/timed-confirmation";
import { overrideWorkingMessage } from "@pi-mono/libs/working-message";

const interrupt = "app.interrupt";
// Long enough to read the hint before the second press.
const confirmationMs = 1500;

/** Pi's editor, except that it can hold back an interrupt press. */
class AbortGuardEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    private readonly keys: KeybindingsManager,
    private readonly holdInterrupt: () => boolean
  ) {
    // Pi's default editor draws the working status in its top border.
    super(tui, theme, keys, { embedWorkingStatus: true });
  }

  override handleInput(data: string): void {
    // While autocomplete shows, the interrupt key only closes it.
    if (this.keys.matches(data, interrupt) && !this.isShowingAutocomplete() && this.holdInterrupt())
      return;
    super.handleInput(data);
  }
}

export default function abortGuard(pi: ExtensionAPI): void {
  const hint = overrideWorkingMessage(pi);
  let confirmation: TimedConfirmation<typeof interrupt> | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    // Pi clears the editor factory before session_start, so this one belongs to another extension.
    if (ctx.ui.getEditorComponent()) {
      ctx.ui.notify(
        "pi-abort-guard: another extension replaced the editor; one press still interrupts.",
        "warning"
      );

      return;
    }

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

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) => new AbortGuardEditor(tui, theme, keybindings, holdInterrupt)
    );
  });

  // A press near the end of one run must not count toward the next run.
  pi.on("agent_settled", () => {
    if (!confirmation?.armed) return;
    confirmation.cancel();
    hint.setText();
  });

  pi.on("session_shutdown", () => {
    confirmation?.dispose();
    confirmation = undefined;
  });
}
