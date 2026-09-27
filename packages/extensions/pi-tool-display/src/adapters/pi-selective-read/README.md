# pi-selective-read integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piSelectiveReadAdapter(toolInfo)` recognizes the workspace [`pi-selective-read`](../../../../pi-selective-read/README.md) extension's `read` tool by package provenance and its parameter schema. For [standalone integration](../../../docs/renderers.md#explicit-contracts), pass `selectiveReadDisplayAdapter` from `pi-tool-display/adapters`.

Schema recognition checks integer coordinate types, required fields, and selection strictness in the [projected tool schema](../../../../../libs/src/tool-schema/README.md). It does not require provider-unsupported numeric bounds; argument validation still enforces positive safe integers and ordered ranges.

[Automatic selection](../../../docs/adapters.md#automatic-selection) uses this adapter. Use [renderer overrides](../../../README.md#configuration) to retain the extension's own renderers or force generic cards.

## Arguments and results

Use [read arguments](../../../../pi-selective-read/README.md#usage); optional `null` values, including selection coordinates, count as omitted to match Pi normalization. Unknown top-level fields are ignored for display, matching read execution, without changing retained arguments. Known fields and nested `selection` remain validated; unknown selection fields are rejected.

`details.selectiveRead.sourceBlocks` counts source blocks and requires `selection` plus exactly one following text preview. Only that recorded preview is hidden, never similar-looking source.

In automatic mode, incompatible arguments or results use the shared [invalid-input fallback](../../../docs/conventions.md#invalid-input-fallback).

## Display

Headings separate read windows and selection ranges. Compatible reads [group](../../../docs/presentation.md#groups); expansion uses search-match backgrounds without the model preview.

Selection coordinates refer to retained source before terminal sanitization and tab expansion. Continuation and truncation notices remain visible and are excluded from selections. Trailer recognition has the same [text-envelope provenance limits](../native/README.md#text-envelope-provenance) as native cards.

Other result presentation follows the [native adapter](../native/README.md#display). Images, errors, cancellations, and partial results do not receive selection highlighting.

## Validation

Use [package validation](../../../README.md#validation), including the [installed-CLI compatibility check](../../host/install-cli.test.ts).

For visual checks:

1. Load both extensions. Include repeated reads, tabs, wide characters, multiline selections, selections outside the read window, images, and failed reads.
2. Expand and collapse groups at narrow and wide terminal sizes in light and dark themes. Check that expanded reads show source once, without the appended preview.
3. Replay the session. Check that expanded reads still highlight selections without repeating previews.
