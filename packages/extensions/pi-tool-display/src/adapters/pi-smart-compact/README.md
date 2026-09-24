# pi-smart-compact adapter

[Adapter development](../../../docs/adapters.md) · [Compaction extension](../../../../pi-smart-compact/README.md)

## Compatibility and selection

Matches `pi-smart-compact` provenance and each registration's parameter contract: optional string `instructions` for `compact`, no parameters for `context_window`. Unrelated same-name tools, SDK/builtin sources, and incompatible schemas are not specialized. Renderer overrides still apply.

## Compaction cards

Cards read **Requesting compaction** while pending and **Requested compaction** after acknowledgement. Supplied instruction focus follows the title, without JSON parameter syntax. This confirms only the request, not successful compaction; native compaction and subsequent skip/failure status messages remain unchanged.

A complete successful `Compaction requested.` acknowledgement with `details.scheduled: true` is represented by the heading rather than duplicated in the body. When paired valid `details.modelOverride` and `details.thinkingLevel` are present, the body shows:

```text
Model: provider/model-id:off
```

The model and thinking level describe the request-time selection, not confirmation that native default summarization ran. Missing or invalid metadata, partial/error/cancelled results, and arbitrary output remain unchanged. Display-only model information never changes the agent-facing acknowledgement or saved content.

## Context-window cards

Cards read **Checking context window** and **Checked context window**. Valid `details.tokens`, `details.contextWindow`, and `details.percent` produce a compact summary:

```text
5,963 / 272,000 tokens · 2.19% used
```

Numbers use grouped digits and at most two decimal places for display only. Null token usage stays explicitly unknown; null percentages are omitted, never calculated. Usage over 100% is not clamped. Missing or invalid details retain the original result text, including `Context usage unavailable.` Errors retain their diagnostics. Expansion adds the raw result beneath the summary.

## Shared behavior

Both cards hide raw parameters by default, including on expansion; `showParameters: true` restores them. Compaction focus remains visible either way. Without the adapter or a current verified tool definition, generic rendering remains available.

Adapters never change retained arguments/results or model context, read current settings, execute compaction, or observe native operations. Replay uses saved details, so later configuration changes cannot relabel earlier requests.

## Validation

Colocated tests cover both provenance/schema contracts, renderer overrides, pending/completed headings, parameter policy, request-time metadata, unknown/zero/over-capacity usage, collapsed/expanded rendering, narrow widths, reused rows, and borrowed-result preservation. The compaction package's SDK/CLI tests own persistence and model-facing content. Follow [package validation](../../../README.md#validation) for checks and terminal-specific limits.
