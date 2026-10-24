# pi-smart-compact adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Calls to the `compact` and `context_window` tools from [`pi-smart-compact`](../../../../pi-smart-compact/README.md) appear as cards with the compaction focus and readable context usage. See [smart compact cards](../../../docs/tools.md#smart-compact).

## Compatibility and selection

The adapter matches `pi-smart-compact` provenance and each registration's parameter contract: optional string `instructions` for `compact`, no parameters for `context_window`. Unrelated tools with the same name, SDK and built-in sources, and incompatible schemas are not specialised. Renderer overrides still apply; see [automatic selection](../../../docs/adapters.md#automatic-selection).

The [adapter contract](contract.md) lists the result details behind each card.

## Validation

Colocated tests check that rendering leaves borrowed arguments and results unchanged. Selection and presentation use the [manual checks](../../../docs/testing.md#manual-checks). The compaction package's SDK and CLI tests own persistence and model-facing content.
