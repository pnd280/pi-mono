# pi-todo integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency. This host selects/renders/groups its cards; inactive display or `todo: original` uses Pi defaults.

## Arguments and results

A retained `details.tasks` snapshot supplies task subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new task when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

After a result exists, incompatible arguments use ungrouped generic cards, e.g. `Call failed todo({})`. Unrecognized details do not force fallback, but subjects, progress, and outcomes require validated details.

## Display

Supported cards start with `Tasks` and the action, for example `Tasks · Created Review docs` or `Tasks · Updated #3 Review docs · status → completed`.

Compact cards replace successful output with a `dim` summary of confirmed task state and overall progress, such as `#3 completed · 1/3 completed · 1 in progress · 1 pending`:

- Progress excludes deleted tasks. Snapshots containing only deleted tasks report their count and `no active tasks`. Empty snapshots report `No tasks`.
- Lists with a status filter or `includeDeleted: true` also report the number of listed tasks.
- Missing or invalid snapshots use an output preview.
- Failures omit the summary and show diagnostic bodies in `error`.

Expansion adds full result text. Success displays `[in_progress]` as `[in progress]`, `inProgressLabel` as `Activity`, and `blockedBy` as `Blocked by`, dimming known status brackets without changing retained/model-visible results.

Adjacent `todo` calls form a collapsed `Tasks` group with one member line per action and no call count. Each member keeps its result summary. Expansion restores each call's full card.

## Validation

Run the [focused validation commands](../../../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.
