# pi-profiles adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Calls to the `tool_search` tool that [`pi-profiles`](../../../../pi-profiles/README.md) registers appear as the same cards as Pi's built-in [tool search](../builtin/tool-search/README.md). This page documents the adapter contract for its maintainers; if you use `pi-profiles`, read [Display](#display) for how its calls appear.

## Compatibility and selection

pi-profiles always registers Pi's own `tool_search` with `createToolSearchExtension()`, in place of the built-in extension; see its [tool search](../../../../pi-profiles/README.md#tool-search). Pi then records pi-profiles as the tool's source, so the [built-in adapter](../builtin/tool-search/README.md#compatibility-and-selection) does not match it.

The adapter matches the tool name `tool_search`, `pi-profiles` provenance, and the parameter contract of the built-in adapter: a required string `query` and an optional number `limit`. Other tools of pi-profiles, `tool_search` tools of other npm packages, and incompatible schemas are not specialised. A local extension is identified by its path, so another extension in a `pi-profiles` directory also matches. Renderer overrides still apply; see [automatic selection](../../../docs/adapters.md#automatic-selection).

## Display

Cards and summaries are those of the [built-in tool search](../builtin/tool-search/README.md#display), because the tool and its `details.loaded` result are Pi's. The loaded names include the tools that the current profile deferred, such as `bash`. Failure warnings name the adapter `pi-profiles:tool_search`.

## Summary mode

Summary mode follows the [built-in tool-search rules](../builtin/tool-search/README.md#summary-mode).

## Limitations

The adapter does not show which loaded tools a profile deferred; the result details do not record it. When a match belongs to a deferred [group](../../../../pi-profiles/README.md#groups), pi-profiles also loads the group's other tools, but the result does not name them, so the card does not show them.

## Validation

Run [package validation](../../../README.md#validation). Selection and presentation use the [manual checks](../../../docs/testing.md#manual-checks):

| Do                                                                                                                                   | Expect                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| In a new session where `bash` is declared and not used, switch to a profile that defers `bash`, then ask the model to run a command. | The `tool_search` card reads "Searched tools" and names `bash`. |
