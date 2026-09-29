# pi-todo integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency. This host selects/renders/groups its cards; inactive display or `todo: original` uses Pi defaults.

## Arguments and results

A validated snapshot in retained `details.tasks` supplies todo subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new todo when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

After a result exists, incompatible arguments use ungrouped generic cards, e.g. `Call failed todo({})`. Unrecognized details do not force fallback, but subjects, progress, and outcomes require validated details.

## Display

Supported cards start with `Todos` and the action.

Compact cards replace successful output with confirmed status and progress:

- Progress excludes deleted todos. Snapshots containing only deleted todos report their count and `no active todos`. Empty snapshots report `No todos`.
- Lists with a status filter or `includeDeleted: true` also report the number of listed todos.
- Missing or invalid snapshots use an output preview.
- Failures omit the summary and show diagnostic bodies in `error`.

Expansion restores full result text. API labels remain literal because unstructured output cannot reliably distinguish them from task content; friendly labels apply only to generated headings and summaries.

Adjacent `todo` calls form a collapsed `Todos` group with one member line per action and no call count. Each member keeps its result summary. Expansion restores each call's full card.

Calls using this adapter are omitted from [run summary lines](../../../docs/presentation.md#summary-mode), including incompatible calls using generic fallback. They contribute no counts; a todo-only run shows no line.

## Validation

Run the [focused validation commands](../../../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.
