# @ff-labs/pi-fff adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

FFF searches appear as compact cards with match counts, grouped by search filter. See [FFF cards](../../../../docs/tools.md#fff).

## Compatibility and selection

`piFffAdapter(toolInfo)` checks the provenance and schemas of the official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) for its `fffind`, `ffgrep`, and `fff-multi-grep` tools and overridden `find`, `grep`, and `multi_grep` names. Provenance accepts any package version; the schemas and cursor handling were inspected in 0.11.0. See [name classification](../../../../../../utils/src/fff-tools.ts) and the [resolver](index.ts) for current contracts.

See [automatic selection](../../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element. A supplied `path`, find `cursor`, or multi-search `constraints` must be a string.

Missing result details and empty details objects are supported. Nonempty details objects must contain finite numeric `totalMatched` and `totalFiles`. Null, primitive, and array details are rejected. Incompatible retained calls or results use generic cards and do not join exploration groups.

## Display

[FFF cards](../../../../docs/tools.md#fff) describes what users see. Groups use the literal `path` or multi-search `constraints` as their filter. Result summaries need nonnegative integer `totalMatched` and `totalFiles`:

- For grep and multi-grep, `totalMatched` is the number of matches collected for the call.
- For find, `totalMatched` is the total number of matching files, which can exceed the current page.
- `totalFiles` is the unfiltered number of indexed files.

## Validation

The manual check needs official `@ff-labs/pi-fff` installed separately, because it is not a workspace dependency. Follow the [FFF terminal check](../../../../docs/validation.md#fff) for the launch flags, the multi-search setting, and the expected groups.
