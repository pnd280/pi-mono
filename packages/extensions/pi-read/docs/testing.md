# Selective-read test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests selection validation and the guard around Pi's native `read`, preview bounds, and the [`pi-read/result` contract](result.md). [Tool display](../../pi-tool-display/docs/testing.md) owns adapter recognition and grouped rendering; Pi owns file access and images.

## Must not regress

- **High, unit:** Selections require positive safe integers and ordered ranges, and reject unknown fields, before native execution.
- **High, unit:** The native tool executes once with the independent read window and the caller's cancellation signal and update callback, without a second read. Native failures propagate to the caller.
- **High, unit:** Adding a preview preserves native content blocks and unrelated details.
- **High, unit:** Preview bounds come from the source actually returned, not the requested limits, and exclude native continuation and truncation notices.
- **High, unit:** Only validated preview provenance hides an appended preview, so unmarked source and literal preview lookalikes stay visible.
- **High, unit:** Malformed counts, preview positions, mixed images, and invalid native details preserve borrowed content while reporting invalidity.

## Not tested

- Schema projection, source clipping, preview formatting, empty-selection notices, and highlight rendering: below the severity bar.
- Pi's filesystem implementation: owned by Pi.

## Manual checks

Check appearance changes by hand. Setup: in Pi, read a file with a multiline selection that includes tabs and wide characters.

| Do                                    | Expect                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| View the read collapsed and expanded. | Context stays visible, and the preview isn't shown twice. |
| Narrow the terminal.                  | Highlighting stays on the selected span.                  |
| Switch between light and dark themes. | The highlight is readable in both.                        |
