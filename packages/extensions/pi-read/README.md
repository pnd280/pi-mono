# pi-read

The model can point at an exact span of code while reading a file, such as `src/example.ts:12:4-15:9`. Pi's `read` gains a `selection` argument: the result keeps the usual surrounding lines, adds a short preview of just the selected span, and highlights the span when you expand the read.

## Usage

Put the filename in `path`, the span in `selection`, and the lines to read in `offset` and `limit`; the read window and the selection are independent. For `src/example.ts:12:4-15:9`:

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

`path` doesn't parse location suffixes such as `:12:4`.

### Coordinates

- Lines are absolute and start at 1.
- Columns count Unicode code points from 1, not bytes or terminal cells.
- `startColumn` defaults to 1, and `endLine` defaults to `startLine`.
- `endColumn` is exclusive. Leave it out to select to the end of the last line.
- All values must be positive safe integers, and the end must come after the start.

### Preview

The preview is appended after the file content, which is left unchanged.

- It shows at most five lines, and 500 code points per line, with `…` marking omissions.
- If the selection extends beyond the read window, the preview may be partial.
- If the selected span has no text, check its coordinates and the read window before another read.
- For exact edits, use the original read content, not the preview.

Expand a successful text read to see the selection highlighted in context. Pi's image handling and truncation limits still apply.

## Side effects

- It replaces the built-in `read` tool and adds prompt guidance about source references.
- Previews become part of tool results and session history.
- It writes no files, makes no network requests, and keeps no other state.

## Compatibility

Don't load another `read` replacement alongside this extension.

With [pi-tool-display](../pi-tool-display/README.md#configuration), choose how reads render with `rendererOverrides.read`:

| Value            | Rendering                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (default) | The [selective-read adapter](../pi-tool-display/src/adapters/pi-read/README.md) groups compatible reads and highlights selections without repeating the preview. |
| `original`       | This extension's own rendering, ungrouped.                                                                                                                       |
| `generic`        | No highlighting, and the appended preview is shown.                                                                                                              |

## Validation

Run the [focused checks](../../../docs/development.md#focused-validation) for `pi-read`.

| When you…                         | Read                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Change selection or preview logic | The [coverage specification](docs/testing.md).                               |
| Change how reads look             | The [manual appearance checks](docs/testing.md#manual-checks), done by hand. |
| Upgrade Pi                        | [Pi compatibility](docs/pi-compatibility.md).                                |
