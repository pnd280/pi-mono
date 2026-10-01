# pi-smart-compact adapter

[Adapter development](../../../docs/adapters.md) · [Compaction extension](../../../../pi-smart-compact/README.md)

## Compatibility and selection

The adapter matches `pi-smart-compact` provenance and each registration's parameter contract: optional string `instructions` for `compact`, no parameters for `context_window`. Unrelated tools with the same name, SDK and built-in sources, and incompatible schemas are not specialised. Renderer overrides still apply; see [automatic selection](../../../docs/adapters.md#automatic-selection).

## Compaction cards

Cards read "Requesting compaction" while pending and "Requested compaction" after acknowledgement. Supplied instruction focus follows the title, without JSON parameter syntax. This confirms only the request, not successful compaction; native compaction and any later skip or failure status messages are unchanged.

A successful `Compaction requested.` acknowledgement with `details.scheduled: true` is not duplicated in the body. Valid `details.modelOverride` and `details.thinkingLevel` show the request-time model selection.

The model and thinking level describe the request-time selection, not confirmation that native default summarization ran. Missing or invalid metadata, partial, failed, or cancelled results, and arbitrary output are shown unchanged. Display-only model information never changes the agent-facing acknowledgement or saved content.

## Context-window cards

Cards read "Checking context window" and "Checked context window". Valid `details.tokens`, `details.contextWindow`, and `details.percent` produce a compact usage summary.

Unknown token usage remains unknown; missing percentages are not calculated, and over-capacity usage is not clamped. Invalid details and errors keep the original text and diagnostics; expansion shows the raw result.

## Shared behaviour

Both cards hide raw parameters by default, including on expansion; `showParameters: true` restores them. Compaction focus remains visible either way. Without the adapter or a current verified tool definition, generic rendering remains available.

Adapters never change retained arguments, results, or model context, read current settings, execute compaction, or observe native operations. Replay uses saved details, so later configuration changes cannot relabel earlier requests.

## Validation

Run [package validation](../../../README.md#validation); colocated tests cover selection and presentation. The compaction package's SDK and CLI tests own persistence and model-facing content.
