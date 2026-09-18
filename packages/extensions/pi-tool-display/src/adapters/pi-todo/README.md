# pi-todo integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piTodoAdapter(toolInfo)` supports the workspace [`pi-todo`](../../../../pi-todo/README.md) `todo` tool. It verifies package provenance (`npm:pi-todo` or a `pi-todo` entry path) and that the registered parameters declare a string `action` before matching. SDK tools, builtin tools, and unrelated tools named `todo` do not qualify.

`pi-todo` supplies no tool renderers and has no dependency on pi-tool-display. This extension's host integration selects the adapter and owns all todo card rendering and grouping. When this extension is inactive, or the `todo` renderer override is `original`, Pi uses its default rendering.

## Arguments and results

A retained `details.tasks` snapshot supplies resolved subjects and the progress notice. A retained `details.error` marks the call as a failure even when Pi's error flag is false. Incompatible retained arguments or details fall back to the preserved renderers or generic cards.

## Display

Every card starts with the `Todo` heading and the action, for example `Todo · Created Ship it` or `Todo · Updated #3 status → completed`. Create summaries add the subject, parent, and initial dependencies; update summaries name the changed fields. `list` and `get` results dim their known `[status]` brackets. Standalone and expanded cards add a `dim` progress line such as `1/3 completed · 1 in progress · 1 pending`; collapsed group members reserve it for expansion. Failures omit the progress line and use `error` styling for the diagnostic body.

Adjacent `todo` calls form a collapsed `Todo · N calls` group with one member line per action. Expansion restores each call's full card.

## Validation

Run the [focused validation commands](../../../../../../docs/development.md#focused-validation) with package name `pi-tool-display`.
