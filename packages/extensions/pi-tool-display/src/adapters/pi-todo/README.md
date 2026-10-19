# pi-todo adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Todo calls from [`pi-todo`](../../../../pi-todo/README.md) appear as `Todos` cards with confirmed statuses and progress. See [todo cards](../../../docs/tools.md#todo).

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency; this extension imports only its pure `pi-todo/text` module, never its extension factory. This extension selects, renders, and groups its cards; inactive display or `todo: original` uses Pi defaults.

## Arguments and results

Argument and snapshot validation use the action and status vocabularies from `pi-todo/text`, so they track the tool; a new action fails type checking until it has heading verbs. Retained task IDs must be positive safe integers. Argument IDs remain numeric so the tool can return domain errors.

A validated snapshot in retained `details.tasks` supplies todo subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new todo when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

After a result exists, incompatible arguments use ungrouped generic cards, for example `Call failed todo({})`. Unrecognised details do not force fallback, but subjects, progress, and outcomes require validated details.

## Display

[Todo cards](../../../docs/tools.md#todo) describes what users see. Subject previews, status words, and progress summaries come from the [`pi-todo/text`](../../../../pi-todo/src/text.ts) contract, so cards match the widget and browser. The adapter sets `omitFromSummary`, so todo calls stay out of summary lines.
