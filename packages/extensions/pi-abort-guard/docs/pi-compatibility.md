# Pi compatibility for maintainers

[pi-abort-guard](../README.md)

> Last verified against Pi 1.3.0 (package checks and a source review: against Pi 1.2.0, the custom editor, keybindings, extension runner, and session idle state are unchanged, the bundled editor-replacement code is identical, and interactive mode changes only the overlay close path and the `/share` destination setting). Not covered: an offline host run, a physical terminal, dialogs during a run, and compaction or retry presses.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation).
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

[Extension](../src/index.ts):

- [ ] `CustomEditor.handleInput` still sends `app.interrupt` presses to `onEscape` only when autocomplete is hidden.
- [ ] `setEditorComponent` still sets `onEscape` on a `CustomEditor` subclass to call the default editor's current handler, and copies the action handlers, padding, and autocomplete settings.
- [ ] Pi's default editor still sets only `embedWorkingStatus` among the options that `setEditorComponent` does not copy.
- [ ] Session replacement and `/reload` still clear the editor factory before `session_start`.
- [ ] `ctx.isIdle()` is still `false` during agent runs, retries, and compaction.
- [ ] `keyText("app.interrupt")` still names the active interrupt keys.
- [ ] Retries and compactions still show their own status indicators instead of the working message, as the [README](../README.md#behaviour) states.

## Limitations

- If Pi adds a setting that requires a double press to interrupt, remove this extension.
