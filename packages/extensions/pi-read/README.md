# pi-read

The model can point at an exact span of code while reading a file, such as `src/example.ts:12:4-15:9`. pi-read gives Pi's `read` a `selection` argument: the result keeps the usual surrounding lines, adds a short preview of just the selected span, and highlights the span when you expand the read.

For `src/example.ts:12:4-15:9`, the model puts the filename in `path`, the span in `selection`, and the lines to read in `offset` and `limit`:

```json
{
  "path": "src/example.ts",
  "offset": 8,
  "limit": 20,
  "selection": {
    "startLine": 12,
    "startColumn": 4,
    "endLine": 15,
    "endColumn": 9
  }
}
```

## Controls

| Control           | Effect                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `read` model tool | Pi's `read` with an optional `selection` argument that adds a preview of the selected span and highlights it in the expanded read. |

## Usage

The read window and the selection are independent: `offset` and `limit` choose the lines to read, and `selection` marks the span. `path` doesn't parse location suffixes such as `:12:4`.

### Coordinates

- Lines are absolute and start at 1.
- Columns count Unicode code points from 1, not bytes or terminal cells.
- `startColumn` defaults to 1, and `endLine` defaults to `startLine`.
- `endColumn` is exclusive. Leave it out to select to the end of the last line.
- All values must be positive safe integers, and the end must come after the start.

### Preview

The extension appends the preview after the file content and leaves the content unchanged.

- It shows at most five lines, and 500 code points per line, with `…` marking omissions.
- If the selection extends beyond the read window, the preview may be partial.
- If the selected span has no text, the preview says so. When the selection also extends beyond the read window, it asks the model to check the coordinates, offset, and limit.
- For exact edits, use the original read content, not the preview.

Expand a successful text read to see the selection highlighted in context. Pi's image handling and truncation limits still apply.

### Other read extensions

Don't load another `read` replacement alongside this extension.

With [pi-tool-display](../pi-tool-display/README.md#configuration), choose how reads render with `rendererOverrides.read`:

| Value            | Rendering                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auto` (default) | [Selective-read cards](../pi-tool-display/docs/tools.md#selective-read) group compatible reads and highlight selections without repeating the preview. |
| `original`       | This extension's own rendering, ungrouped.                                                                                                             |
| `generic`        | No highlighting, and the appended preview is shown.                                                                                                    |

## Side effects

- pi-read replaces the built-in `read` tool and adds prompt guidance about source references.
- Previews become part of tool results and session history.
- pi-read writes no files, makes no network requests, and keeps no other state.

## Docs

| When you…                                                    | Read                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Interpret pi-read results in a display adapter or other tool | [Selective-read result interpretation](docs/result.md)    |
| Change selection or preview logic                            | [Test coverage](docs/testing.md)                          |
| Change how reads look                                        | [Manual appearance checks](docs/testing.md#manual-checks) |
| Upgrade Pi                                                   | [Pi compatibility](docs/pi-compatibility.md)              |
