# Selective-read test coverage for maintainers

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

Shared algorithms are tested in libs and utils; see the [workspace ownership rules](../../../../docs/agents/testing.md#ownership). This package owns the [`pi-read/result` interpretation contract](result.md), preview bounds, and renderer wiring. Adapter recognition, diagnostic styling, and grouped rendering are tested in [tool display](../../pi-tool-display/docs/testing.md).

## Contracts

The selection adds a preview to eligible native text results while preserving the independent read window and original content.

### Registration and schema

- A native `read` replacement is registered, with source-reference guidance and a selection schema Pi can execute.
- The extended schema and native metadata come from the supplied definition, without changing its schema or constructing another native tool.
- The [projected](../../../libs/src/tool-schema/README.md) selection schema keeps integer types, required fields, and descriptions, and rejects unknown keys.
- Positive safe integers and ordered ranges are enforced before native execution.

### Execution

- The independent read window, cancellation, updates, and native failures are passed through without a second read.
- Native content blocks and details are kept. A preview is appended only to eligible text results.
- Image results and image failure notes are unchanged.

### Preview

- Preview bounds come from the source actually returned, not the requested limits. Native continuation and truncation notices are excluded.
- Previews are limited to five lines and 500 code points per line, with indicators for omitted or partial content.
- Empty or missing selected text gets a notice saying what to do.
- Preview provenance survives serialisation, without hiding unmarked source or literal text that looks like a preview.
- Malformed counts, preview positions, mixed images, and invalid native details preserve borrowed content while reporting invalidity. Absent provenance stays distinguishable from invalid provenance.
- Fractional and end-relative native windows, returned truncation counts, multi-block joins, empty blocks, and trailing newlines keep aggregate and per-block highlight coordinates consistent with the retained source.

### Rendering

- Expanded rendering highlights the selected source once, after tabs and control characters are handled, and keeps context and diagnostics.
- Source columns count code points, not terminal cells.
- Read-window labels use native fractional slicing boundaries. Empty windows retain the explicit limit instead of implying an unlimited read.
- Retained optional `null` coordinates highlight the same selection that Pi executes, without changing borrowed arguments.
- Collapsed text shows a hint to expand. Image, error, and partial results use Pi's renderer.
- Unselected collapsed reads keep line summaries and native notices without showing source. Malformed renderer arguments recover optional fields independently, and invalid provenance does not hide retained blocks.

## How to test

Use real native reads to check continuation notices and image results.

## Not covered here

- Pi's filesystem implementation, and the utility's matrix of coordinate cases.
- Themes and terminal widths; use the [manual appearance checks](../README.md#validation).
