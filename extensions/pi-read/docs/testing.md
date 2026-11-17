# Selective-read test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests selection validation, the guard around Pi's native `read`, preview bounds, and the [`pi-read/result` contract](result.md). [Tool display](../../pi-tool-display/docs/testing.md) owns adapter recognition and grouped rendering, and Pi owns file access and images.

## Must not regress

- **High, e2e:** Selections require positive safe integers and ordered ranges, and reject unknown fields, before native execution.
- **High, unit:** Selections use absolute one-based lines and one-based Unicode code-point columns with exclusive ends for preview text and corresponding UTF-16 highlight ranges.
- **High, e2e:** The native tool executes once with the independent read window and the caller's cancellation signal and update callback, without a second read.
- **High, e2e:** Native failures propagate to the caller.
- **High, e2e:** Adding a preview preserves native content blocks and unrelated details.
- **High, e2e:** Preview bounds come from the source actually returned, not the requested limits, and exclude native continuation and truncation notices.
- **High, unit:** Only validated preview provenance hides an appended preview, so unmarked source and literal preview lookalikes stay visible.
- **High, unit:** Malformed counts, preview positions, mixed images, and invalid native details preserve borrowed content while reporting invalidity.

## Not tested

- Schema projection, preview formatting, empty-selection notices, highlight rendering, and native rendering of errors, partial results, and images are below the severity bar.

## Manual checks

In Pi, read a file with a multiline selection that includes tabs and wide characters.

| Do                                                         | Expect                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| View the read collapsed and expanded.                      | Context stays visible, and the preview isn't shown twice.          |
| Narrow the terminal.                                       | Highlighting stays on the selected span.                           |
| Switch between light and dark themes.                      | The highlight is readable in both.                                 |
| Read an image and a missing file with a selection.         | Each card matches Pi's native read and shows no selection preview. |
| Call `tools.read` with a selection from a codemode script. | The script gets the source without the selection preview.          |
