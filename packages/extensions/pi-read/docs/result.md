# Selective-read result interpretation

[pi-read](../README.md) · [Implementation](../src/result.ts)

Callers of `pi-read/result` use `interpretReadResult(result, window)` to validate preview provenance and interpret retained native text. The subpath is pure: it imports no extension registration, tool construction, file access, or terminal styling.

## Borrowed results and validation

The caller supplies typed, borrowed text and image blocks through `ReadResultView`. The interpreter validates `details` without replacing any blocks or unrelated metadata. Display callers still validate their outer result shape and arguments.

- `valid` is false for malformed details or preview provenance. Display rejects these contracts; the producer renderer recovers their retained source.
- `preview.kind` distinguishes `absent`, `invalid`, and `valid`. An invalid marker is not equivalent to an absent marker.
- A valid marker has a positive safe `sourceBlocks` count, exactly one following preview block, and an all-text result. `preview.contentIndex` identifies that trailing block.
- `sourceContent` borrows the original blocks. Only valid provenance excludes the preview. Unmarked text, including preview-heading lookalikes, is never hidden.
- `appendPreview` preserves native blocks and unrelated details. It leaves invalid preview provenance intact and replaces an already validated preview rather than stacking previews.

## Source windows and highlights

Pass the independent native `offset` and `limit`, with omitted fields and explicit `undefined` treated identically. Native fractional and negative windows retain their native slicing arithmetic; selection-coordinate restrictions do not apply to these arguments. A validated native `truncation.outputLines` takes precedence over the requested limit, including zero source lines for a byte-limit diagnostic.

In Pi 1.0.2, an untruncated read with a negative slice end appends a blank line and one continuation-notice line. Both views exclude those two lines from the source limit without matching their prose. An empty slice therefore looks like one empty source line.

The two source views are interpreted on demand, so provenance recognition and notice handling do not join or split source bodies:

| View            | Contract                                                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document`      | Aggregate text with Pi's newline joins. It removes one final newline, bounds source lines, and retains excluded lines in `notice`. `select(selection)` returns the shared code-point selection, partial status, and UTF-16 highlight `ranges`. |
| `blocks[index]` | The original content position. `highlight(sourceText, selection)` uses that block's absolute first line and remaining native source allowance, returning zero-based lines and UTF-16 offsets in the supplied raw source part.                  |

For per-block highlighting, pass the source part after native presentation has separated its diagnostic trailer, never styled or sanitised text. Original preceding blocks contribute their complete split-line counts, including empty blocks, trailing newlines, and diagnostic lines. Aggregate and per-block coordinates therefore preserve block joins without flattening the displayed blocks. A trailing newline is not an additional selectable line within a single block, but can contribute an empty line in the aggregate join.

Display callers validate retained selections with `retainedSelectionSchema` from `pi-read/result`. It treats optional coordinate `null` values as omitted, matching Pi's execution normalisation, then uses the shared source-selection schema. Required coordinates and unknown fields remain strict. Terminal sanitisation, tab expansion, themes, diagnostic styling, partial and failed-result eligibility, and grouping remain renderer policy.

## Native provenance limits

The aggregate view bounds source using the native read window and truncation metadata, not prose. Per-block display separates recognised native diagnostic envelopes before highlighting. Embedded trailer lookalikes stay source; byte-identical literal trailing envelopes share the native presentation's documented provenance limit. This module does not claim to distinguish them.

Images are not selectable text. Pi's text-only failed-image prefix, `Read image file [image/`, is also excluded; a literal source prefix is indistinguishable until Pi supplies typed image-failure metadata. No files are reread to recover omitted source or resolve these ambiguities.
