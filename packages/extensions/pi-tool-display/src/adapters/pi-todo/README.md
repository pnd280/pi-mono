# pi-todo integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piTodoAdapter(toolInfo)` supports the workspace [`pi-todo`](../../../../pi-todo/README.md) `todo` tool. It checks package provenance (`npm:pi-todo` or a `pi-todo` entry path) and requires the registered parameters to declare a string `action`. SDK tools, built-in tools, and unrelated tools named `todo` do not qualify.

`pi-todo` supplies no tool renderers and has no dependency on `pi-tool-display`. This extension's host integration selects the adapter and handles task card rendering and grouping. When this extension is inactive, or the `todo` renderer override is `original`, Pi uses its default rendering.

## Arguments and results

A retained `details.tasks` snapshot supplies task subjects, confirmed statuses, and progress summaries. For a successful create call, `details.nextId - 1` identifies the new task when that ID exists in the snapshot. A nonempty `details.error` marks the call as a failure even when Pi's error flag is false.

Once a result exists, incompatible arguments use generic cards and do not group. These cards show the tool name and parameters, such as `Call failed todo({})`. Unrecognized details do not force fallback. The adapter uses subjects, progress, and outcomes only when the details validate.

## Display

Supported cards start with `Tasks` and the action, for example `Tasks · Created Review docs` or `Tasks · Updated #3 Review docs · status → completed`. Create headings add the subject, parent, and initial dependencies. Update headings name the changed fields, using `activity` for `inProgressLabel`.

Compact cards replace successful output with a `dim` summary of confirmed task state and overall progress, such as `#3 completed · 1/3 completed · 1 in progress · 1 pending`:

- Progress excludes deleted tasks. Snapshots containing only deleted tasks report their count and `no active tasks`. Empty snapshots report `No tasks`.
- Lists with a status filter or `includeDeleted: true` also report the number of listed tasks.
- Missing or invalid snapshots use an output preview.
- Failures omit the summary and show diagnostic bodies in `error`.

Expansion shows the full result text beside the summary. Successful result text displays `[in_progress]` as `[in progress]` and uses labels such as `Activity` and `Blocked by` for `inProgressLabel` and `blockedBy`. Known `[status]` brackets are dimmed. These display changes leave retained results and model-visible content unchanged.

Adjacent `todo` calls form a collapsed `Tasks` group with one member line per action and no call count. Each member keeps its result summary. Expansion restores each call's full card.

## Validation

Run the [focused validation commands](../../../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.
