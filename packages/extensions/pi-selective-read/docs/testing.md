# Selective-read coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Register a native read replacement with a strict selection schema Pi can execute and source-reference guidance. Forward the independent read window, cancellation, updates, and native failures without a second read.
- Preserve native content blocks and details; append a preview only to eligible text results. Image results and image failure notes remain unchanged.
- Base preview bounds on returned source, not requested limits; exclude native continuation/truncation notices. Record preview provenance that survives serialization without hiding unmarked source or literal lookalikes.
- Bound previews to five lines and 500 code points per line with omission/partial indicators; empty or absent selected text gets an actionable notice.
- Expanded rendering highlights selected source once, after tab/control handling, while retaining context and diagnostics. Source columns count code points, not terminal cells. Collapsed text shows an expansion hint; image, error, and partial results use Pi's renderer.

## Coverage boundaries

This package owns preview bounds, native-result interpretation, provenance, and renderer wiring. [Utils](../../../utils/docs/testing.md) own coordinate validation and raw source slicing; [libraries](../../../libs/docs/testing.md) own highlight geometry and terminal safety. [Tool display](../../pi-tool-display/docs/testing.md) owns adapter recognition and grouped rendering.

## Exclusions

Do not retest Pi's filesystem implementation or repeat the utility's coordinate matrix. Use real native reads to check continuation notices and image results. For themes and terminal widths, use the [manual appearance checks](../README.md#validation).
