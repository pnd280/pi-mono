# pi-todo adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Todo calls from [`pi-todo`](../../../../pi-todo/README.md) appear as `Todos` cards with confirmed statuses and progress. See [todo cards](../../../docs/tools.md#todo).

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency. This extension imports only its pure `pi-todo/text` module, never its extension factory, and it selects, renders, and groups the todo cards. When display is inactive, or a `todo: original` [renderer override](../../../README.md#configuration) applies, Pi's default rendering is used.

The [adapter contract](contract.md) covers argument and snapshot validation and the data behind each card.
