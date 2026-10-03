# Selective-read test coverage for maintainers

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). This package owns the [`pi-read/result` interpretation contract](result.md), preview bounds, and renderer wiring. Adapter recognition, diagnostic styling, and grouped rendering are tested in [tool display](../../pi-tool-display/docs/testing.md).

## Must not regress

- Positive safe integers and ordered selection ranges are enforced before native execution.
- The native tool executes once with the independent read window, without a second read.
- Native execution receives the caller's cancellation signal and update callback unchanged.
- Native failures propagate to the caller.
- Adding a preview preserves native content blocks and unrelated details.
- Preview bounds come from the source actually returned, not the requested limits.
- Native continuation and truncation notices are excluded from selected source.
- Only validated preview provenance hides an appended preview, so unmarked source and literal preview lookalikes remain visible.
- Malformed counts, preview positions, mixed images, and invalid native details preserve borrowed content while reporting invalidity.

## Contracts

The selection adds a preview to eligible native text results.

### Registration and schema

- A native `read` replacement is registered, with source-reference guidance and a selection schema Pi can execute.
- The extended schema and native metadata come from the supplied definition, without changing its schema or constructing another native tool.
- The [projected](../../../libs/src/tool-schema/README.md) selection schema keeps integer types, required fields, and descriptions, and rejects unknown keys.

### Execution

- Image results and image failure notes are unchanged.

### Preview

- Previews are limited to five lines and 500 code points per line, with indicators for omitted or partial content.
- Empty or missing selected text gets a notice saying what to do.
- Preview provenance survives serialisation.
- Absent provenance stays distinguishable from invalid provenance.
- Fractional and end-relative native windows, returned truncation counts, multi-block joins, empty blocks, and trailing newlines keep aggregate and per-block highlight coordinates consistent with the retained source.

### Rendering

- Expanded rendering highlights the selected source once, after tabs and control characters are handled, and keeps context and diagnostics.
- Source columns count code points, not terminal cells.
- Read-window labels use native fractional slicing boundaries. Empty windows retain the explicit limit instead of implying an unlimited read.
- Retained optional `null` coordinates highlight the same selection that Pi executes, without changing borrowed arguments.
- Collapsed text shows a hint to expand. Image, error, and partial results use Pi's renderer.
- Unselected collapsed reads keep line summaries and native notices without showing source.
- Malformed renderer arguments recover optional fields independently.

## How to test

Unit coverage is limited to the must-not-regress invariants above. Native Pi execution and renderer delegation checks are retained; preview formatting and coordinate-rendering details are not unit-tested here.

Use real native reads to check continuation notices and image results.

## Not covered here

- Pi's filesystem implementation, and the utility's matrix of coordinate cases.
- Themes and terminal widths; use the [manual appearance checks](../README.md#validation).
