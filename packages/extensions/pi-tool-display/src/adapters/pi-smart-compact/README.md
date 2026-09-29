# pi-smart-compact adapter

[Adapter development](../../../docs/adapters.md) · [Compaction extension](../../../../pi-smart-compact/README.md)

## Compatibility and selection

Matches `pi-smart-compact` provenance and each registration's parameter contract: optional string `instructions` for `compact`, no parameters for `context_window`. Unrelated same-name tools, SDK/builtin sources, and incompatible schemas are not specialized. Renderer overrides still apply.

## Compaction cards

Cards read **Requesting compaction** while pending and **Requested compaction** after acknowledgement. Supplied instruction focus follows the title, without JSON parameter syntax. This confirms only the request, not successful compaction; native compaction and subsequent skip/failure status messages remain unchanged.

A successful `Compaction requested.` acknowledgement with `details.scheduled: true` is not duplicated in the body. Valid `details.modelOverride` and `details.thinkingLevel` show the request-time model selection.

The model and thinking level describe the request-time selection, not confirmation that native default summarization ran. Missing or invalid metadata, partial/error/cancelled results, and arbitrary output remain unchanged. Display-only model information never changes the agent-facing acknowledgement or saved content.

## Context-window cards

Cards read **Checking context window** and **Checked context window**. Valid `details.tokens`, `details.contextWindow`, and `details.percent` produce a compact usage summary.

Unknown token usage remains unknown; missing percentages are not calculated, and over-capacity usage is not clamped. Invalid details and errors retain original text/diagnostics; expansion shows the raw result.

## Shared behavior

Both cards hide raw parameters by default, including on expansion; `showParameters: true` restores them. Compaction focus remains visible either way. Without the adapter or a current verified tool definition, generic rendering remains available.

Adapters never change retained arguments/results or model context, read current settings, execute compaction, or observe native operations. Replay uses saved details, so later configuration changes cannot relabel earlier requests.

## Validation

Run [package validation](../../../README.md#validation); colocated tests cover selection and presentation. The compaction package's SDK/CLI tests own persistence and model-facing content.
