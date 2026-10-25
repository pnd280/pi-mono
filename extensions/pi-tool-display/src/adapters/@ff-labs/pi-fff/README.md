# @ff-labs/pi-fff adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

FFF searches appear as compact cards with match counts, grouped by search filter. See [FFF cards](../../../../docs/tools.md#fff).

## Compatibility and selection

`piFffAdapter(toolInfo)` checks the provenance and schemas of the official [`@ff-labs/pi-fff`](https://github.com/dmtrKovalenko/fff/tree/main/packages/pi-fff) for its `fffind`, `ffgrep`, and `fff-multi-grep` tools and overridden `find`, `grep`, and `multi_grep` names. Provenance accepts any package version; the schemas and cursor handling were inspected in 0.11.0. See [name classification](../../../../../../utils/src/fff-tools.ts) and the [resolver](index.ts) for current contracts.

See [automatic selection](../../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy. The [adapter contract](contract.md) lists the accepted arguments and results and the data behind each card.

## Validation

Follow the [FFF terminal check](../../../../docs/validation.md#fff). It needs official `@ff-labs/pi-fff` installed separately, and lists the launch flags, the multi-search setting, and the expected groups.
