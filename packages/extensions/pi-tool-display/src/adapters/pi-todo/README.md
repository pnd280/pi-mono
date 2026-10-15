# pi-todo adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Todo calls from [`pi-todo`](../../../../pi-todo/README.md) appear as `Todos` cards with confirmed statuses and progress. This page documents the adapter contract for its maintainers; if you use `pi-todo`, read [Display](#display) for how its calls appear.

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency; this extension imports only its pure `pi-todo/text` module, never its extension factory. This extension selects, renders, and groups its cards; inactive display or `todo: original` uses Pi defaults.

## Arguments and results

A validated snapshot in retained `details.tasks` supplies todo subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new todo when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

After a result exists, incompatible arguments use ungrouped generic cards, for example `Call failed todo({})`. Unrecognised details do not force fallback, but subjects, progress, and outcomes require validated details.

## Display

Supported cards start with `Todos` and the action. Subject previews, status words, and progress summaries come from the [`pi-todo/text`](../../../../pi-todo/src/text.ts) contract, so cards match the widget and browser: subjects use a 200-code-point budget, including any omission mark, and keep whole graphemes.

Compact cards replace successful output with confirmed status and progress:

- Progress excludes deleted todos. Snapshots containing only deleted todos report their count and `no active todos`. Empty snapshots report `No todos`.
- Lists with a status filter or `includeDeleted: true` also report the number of listed todos.
- Missing or invalid snapshots use an output preview.
- Failures omit the summary and show diagnostic bodies in `error`.

Expansion restores full result text. API labels remain literal because unstructured output cannot reliably distinguish them from task content; friendly labels apply only to generated headings and summaries.

Adjacent `todo` calls form a collapsed `Todos` group with one member line per action and no call count. Each member keeps its result summary. Expansion restores each call's full card.

## Summary mode

Calls using this adapter are omitted from [run summary lines](../../../docs/presentation.md#summary-mode), including incompatible calls using generic fallback. They contribute no counts; a todo-only run shows no line.
