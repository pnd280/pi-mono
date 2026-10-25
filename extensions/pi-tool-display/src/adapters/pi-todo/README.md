# pi-todo adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Todo calls from [`pi-todo`](../../../../pi-todo/README.md) appear as `Todos` cards with confirmed statuses and progress. See [todo cards](../../../docs/tools.md#todo).

## Compatibility and selection

`piTodoAdapter(toolInfo)` requires workspace [`pi-todo`](../../../../pi-todo/README.md) provenance (`npm:pi-todo` or its entry path) and a string `action` schema. SDK, built-in, and unrelated `todo` tools do not qualify.

`pi-todo` has no renderers or display dependency; this extension imports only its pure `pi-todo/text` module, never its extension factory. This extension selects, renders, and groups its cards; inactive display or `todo: original` uses Pi defaults.

The [adapter contract](contract.md) covers argument and snapshot validation and the data behind each card.
