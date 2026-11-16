# pi-smart-compact adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Calls to the `compact` and `context_window` tools from [`pi-smart-compact`](../../../../pi-smart-compact/README.md) appear as cards with the compaction focus and readable context usage, and its context status messages appear as one-line usage rows. See [smart compact cards](../../../docs/tools.md#smart-compact).

## Compatibility and selection

The adapter matches `pi-smart-compact` provenance and each registration's parameter contract: optional string `instructions` for `compact`, no parameters for `context_window`. Unrelated tools with the same name, SDK and built-in sources, and incompatible schemas are not specialised. Renderer overrides still apply; see [automatic selection](../../../docs/adapters.md#automatic-selection).

## Compatibility and registration

Context status messages (`pi-smart-compact.context-usage`) use Pi's public message-renderer API with the identifier exported by `pi-smart-compact/result`, independent of tool selection and private tool-row hooks. Saved statuses render even without the compaction extension loaded. Its [row renderer](../../rendering/context-status.ts) lives with the shared card layout.

The [adapter contract](contract.md) lists the result and message details behind each card and row.

## Validation

Colocated tests check that rendering leaves borrowed arguments, results, and messages unchanged. Selection and presentation use the [manual checks](../../../docs/testing.md#manual-checks). The compaction package's SDK and CLI tests own persistence and model-facing content.
