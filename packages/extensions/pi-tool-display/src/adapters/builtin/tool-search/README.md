# Built-in tool-search adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

Calls to Pi's built-in `tool_search` appear as cards that name the tools each search loaded. See [tool search cards](../../../../docs/tools.md#tool-search).

## Compatibility and selection

The adapter matches Pi's built-in `tool_search` only: tool name `tool_search`, `builtin` source with path `builtin:tool-search`, and parameters with a required string `query` and optional number `limit`. Pi has no public schema-identity check for it, so provenance relies on the synthetic built-in source path.

SDK registrations through `createToolSearchExtension()` get an unverifiable `<inline:…>` source and keep generic cards. Replacement extensions that register their own `tool_search` are not specialised either; the [pi-profiles adapter](../../pi-profiles/README.md) matches the replacement of `pi-profiles`. Renderer overrides still apply; see [automatic selection](../../../../docs/adapters.md#automatic-selection).

## Display

[Tool search cards](../../../../docs/tools.md#tool-search) describes what users see. The "Loaded N tools" line and the per-name summary counts need valid, nonempty `details.loaded` names. Calls with missing or invalid `details.loaded` keep the output preview. Calls with missing, empty, or invalid `details.loaded` count as `tool_search ×N`.

## Limitations

The adapter never activates tools or reads the tool registry; loaded names come only from the retained result details.

## Validation

The [colocated test](index.test.ts) checks that standalone rendering leaves arguments and results unchanged. It does not verify the registered `tool_search` schema.
