# Pi compatibility for maintainers

[pi-abort-guard](../README.md)

> Last verified against Pi 1.3.0 (package checks, source review, and disposable input probes). Not covered: an offline host run, a physical terminal, or live dialogs, compactions, retries, and branch summaries.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation).
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

[Extension](../src/index.ts):

- [ ] `CustomEditor.handleInput` still gives extension shortcuts and image-paste bindings priority over `app.interrupt`, and sends interrupt presses to `onEscape` only when autocomplete is hidden.
- [ ] `setEditorComponent` still sets `onEscape` on a `CustomEditor` subclass to call the default editor's current handler, and copies the action handlers, padding, and autocomplete settings.
- [ ] Pi's default editor still sets only `embedWorkingStatus` among the options that `setEditorComponent` does not copy.
- [ ] Session replacement and `/reload` still clear the editor factory before `session_start`.
- [ ] `ctx.isIdle()` is still `false` during agent runs, retries, compaction, and branch summaries.
- [ ] `agent_settled` still marks the end of a run and its automatic continuations. Manual compaction and tree navigation still emit `session_compact`, `session_compact_failed`, or `session_tree` so pending confirmation can be cleared.
- [ ] `keyText("app.interrupt")` still names the active interrupt keys.
- [ ] Retries, compactions, and branch summaries still show their own status indicators instead of the working message, as the [README](../README.md#behaviour) states.

## Limitations

- If Pi adds a setting that requires a double press to interrupt, remove this extension.
