# Built-in tool-search adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

Calls to Pi's built-in `tool_search` appear as cards that name the tools each search loaded. This page documents the adapter contract for its maintainers; if you use `tool_search`, read [Display](#display) for how its calls appear.

## Compatibility and selection

The adapter matches Pi's built-in `tool_search` only: tool name `tool_search`, `builtin` source with path `builtin:tool-search`, and parameters with a required string `query` and optional number `limit`. Pi has no public schema-identity check for it, so provenance relies on the synthetic built-in source path.

SDK registrations through `createToolSearchExtension()` get an unverifiable `<inline:…>` source and keep generic cards. Replacement extensions that register their own `tool_search` are not specialised either; the [pi-profiles adapter](../../pi-profiles/README.md) matches the replacement of `pi-profiles`. Renderer overrides still apply; see [automatic selection](../../../../docs/adapters.md#automatic-selection).

## Display

Cards read "Searching tools" while pending and "Searched tools" afterward, followed by the query after a spaced em dash. Raw parameters, including `limit`, stay hidden unless `showParameters: true`.

A successful result with valid `details.loaded` names replaces the compact body with "Loaded N tools: a, b" or "No matching tools". Expansion shows only the original text, without the summary line. Errors, cancellations, and invalid details keep the ordinary output preview; unrecognised arguments fall back to generic cards.

## Summary mode

Only ended [runs](../../../../GLOSSARY.md#transcript-structure) have [summary lines](../../../../docs/presentation.md#when-a-run-collapses). Loaded tools count once per name (`loaded 1 tool`, `loaded 3 tools`). Calls with missing, empty, or invalid `details.loaded`, including Pi's error results, count as `tool_search ×N`.

## Limitations

The adapter never activates tools or reads the tool registry; loaded names come only from the retained result details.

## Validation

Run [package validation](../../../../README.md#validation). The [colocated test](index.test.ts) checks that standalone rendering leaves arguments and results unchanged; it does not verify the registered `tool_search` schema.
