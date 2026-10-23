# pi-profiles adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Calls to the `tool_search` tool that [`pi-profiles`](../../../../pi-profiles/README.md) registers appear as the same cards as Pi's built-in tool search. See [tool search from pi-profiles](../../../docs/tools.md#tool-search-from-pi-profiles).

## Compatibility and selection

pi-profiles always registers Pi's own `tool_search` with `createToolSearchExtension()`, in place of the built-in extension; see its [tool search](../../../../pi-profiles/docs/tools.md#tool-search). Pi then records pi-profiles as the tool's source, so the [built-in adapter](../builtin/tool-search/README.md#compatibility-and-selection) does not match it.

The adapter matches the tool name `tool_search`, `pi-profiles` provenance, and the parameter contract of the built-in adapter: a required string `query` and an optional number `limit`. Other tools of pi-profiles, `tool_search` tools of other npm packages, and incompatible schemas are not specialised. A local extension is identified by its path, so another extension in a `pi-profiles` directory also matches. Renderer overrides still apply; see [automatic selection](../../../docs/adapters.md#automatic-selection).

## Display

[Tool search from pi-profiles](../../../docs/tools.md#tool-search-from-pi-profiles) describes what users see. Cards and summaries are those of the [built-in tool search](../builtin/tool-search/README.md#display), because the tool and its `details.loaded` result are Pi's.

## Limitations

The result details do not record which loaded tools a profile deferred, or the other tools of a deferred group that pi-profiles also loads, so the card cannot show them.

## Validation

Selection and presentation use the [manual checks](../../../docs/testing.md#manual-checks):

| Do                                                                                                                                   | Expect                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| In a new session where `bash` is declared and not used, switch to a profile that defers `bash`, then ask the model to run a command. | The `tool_search` card reads "Searched tools" and names `bash`. |
