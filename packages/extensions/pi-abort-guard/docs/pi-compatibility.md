# Pi compatibility for maintainers

[pi-abort-guard](../README.md)

> Last verified against Pi 1.3.0 with package checks, source review, and disposable input probes. Not covered: a physical terminal; live dialogs, compactions, retries, and branch summaries.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation).
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

[Extension](../src/index.ts):

- [ ] `CustomEditor.handleInput` still gives extension shortcuts and image-paste bindings priority over `app.interrupt`.
- [ ] `CustomEditor.handleInput` still sends interrupt presses to `onEscape` only when autocomplete is hidden.
- [ ] `setEditorComponent` still sets `onEscape` after the factory returns, on an editor with `actionHandlers` and no `onEscape`, to call the default editor's current handler.
- [ ] `setEditorComponent` still copies the action handlers, padding, and autocomplete settings.
- [ ] Pi's default editor still sets only `embedWorkingStatus` among the options that `setEditorComponent` does not copy.
- [ ] Pi still reads `embedWorkingStatus` from the editor instance only when it places a status indicator, after the factory returns, so that the extension can turn it off on an editor that another extension built.
- [ ] Session replacement and `/reload` still clear the editor factory before `session_start`.
- [ ] `ctx.isIdle()` is still `false` during agent runs, retries, compaction, and branch summaries.
- [ ] `agent_settled` still marks the end of a run and its automatic continuations.
- [ ] Manual compaction still emits `session_compact` or `session_compact_failed`, and successful tree navigation still emits `session_tree`, so pending confirmation can be cleared. A failed branch summary emits no terminal event.
- [ ] `agent_start`, `session_before_compact`, and `session_before_tree` still fire before each new run, compaction, and tree navigation, so confirmation from an operation without a terminal event is cleared.
- [ ] `keyText("app.interrupt")` still names the active interrupt keys.
- [ ] Retries, compactions, and branch summaries still show their own status indicators instead of the working message, as the [README](../README.md#behaviour) states.

## Limitations

- If Pi adds a setting that requires a double press to interrupt, remove this extension.
