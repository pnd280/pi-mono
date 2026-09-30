# Built-in tool-search adapter

[Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

Matches Pi's built-in `tool_search` only: tool name `tool_search`, `builtin` source with path `builtin:tool-search`, and parameters with a required string `query` and optional number `limit`. Pi's own schema-identity check is not public, so provenance relies on the synthetic built-in source path.

SDK registrations through `createToolSearchExtension()` get an unverifiable `<inline:…>` source and keep generic cards. Replacement extensions that register their own `tool_search` are not specialized either. Renderer overrides still apply.

## Cards

Cards read **Searching tools** while pending and **Searched tools** afterward, followed by the query after a spaced em dash. Raw parameters, including `limit`, stay hidden unless `showParameters: true`.

A successful result with valid `details.loaded` names replaces the compact body with **Loaded N tools: a, b** or **No matching tools**. Expansion shows only the original text, without the summary line. Errors, cancellations, and invalid details keep the ordinary output preview; unrecognized arguments fall back to generic cards.

## Summary mode

Loaded tools count once per name across the run (`loaded 1 tool`, `loaded 3 tools`). Calls with missing, empty, or invalid `details.loaded` count per call as `tool_search ×N`, including pending calls and Pi's error results.

## Limitations

The adapter never activates tools or reads the tool registry; loaded names come only from the retained result details.

## Validation

Run [package validation](../../../../README.md#validation); colocated tests build the fixture from Pi's registered `tool_search` definition.
