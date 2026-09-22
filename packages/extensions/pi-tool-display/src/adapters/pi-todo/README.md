# pi-todo integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency. This host selects/renders/groups its cards; inactive display or `todo: original` uses Pi defaults.

## Arguments and results

A validated snapshot in retained `details.tasks` supplies todo subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new todo when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

After a result exists, incompatible arguments use ungrouped generic cards, e.g. `Call failed todo({})`. Unrecognized details do not force fallback, but subjects, progress, and outcomes require validated details.

## Display

Supported cards start with `Todos` and the action, for example `Todos · Created Review docs` or `Todos · Updated #3 Review docs · status → completed`.

Compact cards replace successful output with a `dim` summary of the confirmed status and overall progress, such as `#3 completed · 1/3 completed · 1 in progress · 1 pending`:

- Progress excludes deleted todos. Snapshots containing only deleted todos report their count and `no active todos`. Empty snapshots report `No todos`.
- Lists with a status filter or `includeDeleted: true` also report the number of listed todos.
- Missing or invalid snapshots use an output preview.
- Failures omit the summary and show diagnostic bodies in `error`.

Expansion adds full result text. For successful results, the adapter displays `[in_progress]` as `[in progress]`, `inProgressLabel` as `Activity`, and `blockedBy` as `Blocked by`. Known status brackets are dimmed; retained results and model-visible content are unchanged.

Adjacent `todo` calls form a collapsed `Todos` group with one member line per action and no call count. Each member keeps its result summary. Expansion restores each call's full card.

## Validation

Run the [focused validation commands](../../../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.
